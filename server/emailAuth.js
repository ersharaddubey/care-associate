const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { User, EmailOtp, Referral } = require('./models');

const clean = (value, max = 200) => String(value || '').trim().slice(0, max);
const emailOf = value => clean(value, 254).toLowerCase();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const hashCode = (email, purpose, code) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(email + ':' + purpose + ':' + code).digest('hex');

let transporter;
function mailer() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error('Email OTP is not configured. Add Gmail SMTP credentials in Vercel environment variables.');
  if (!transporter) transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

function mountEmailAuthRoutes(app, { sign, pub }) {
  app.post('/api/auth/email/request', async (req, res) => {
    try {
      const email = emailOf(req.body.email);
      const purpose = req.body.purpose === 'register' ? 'register' : req.body.purpose === 'login' ? 'login' : '';
      if (!validEmail(email) || !purpose) return res.status(400).json({ error: 'Enter a valid email address.' });
      const existing = await User.findOne({ email }).select('_id role emailVerified');
      if (purpose === 'register' && existing) return res.status(409).json({ error: 'This email is already registered. Please log in.' });
      if (purpose === 'login' && (!existing || !existing.emailVerified || !['patient','helper'].includes(existing.role))) {
        return res.json({ sent: true, message: 'If an account exists for this email, a verification code has been sent.' });
      }
      const recent = await EmailOtp.findOne({ email, purpose, createdAt: { $gt: new Date(Date.now() - 60 * 1000) }, consumedAt: null }).sort({ createdAt: -1 }).lean();
      if (recent) return res.status(429).json({ error: 'Please wait 60 seconds before requesting another code.' });
      const code = String(crypto.randomInt(100000, 1000000));
      await EmailOtp.deleteMany({ email, purpose, consumedAt: null });
      await EmailOtp.create({ email, purpose, codeHash: hashCode(email, purpose, code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
      try {
        await mailer().sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: email,
          subject: 'Your Care Associate verification code',
          text: 'Your Care Associate verification code is ' + code + '. It expires in 10 minutes. If you did not request this code, you can ignore this email.',
          html: '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#14233A"><h2>Care Associate</h2><p>Your verification code is:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 0">' + code + '</div><p>This code expires in 10 minutes. Do not share it with anyone.</p></div>',
        });
      } catch (mailError) {
        await EmailOtp.deleteMany({ email, purpose, consumedAt: null });
        throw new Error('Could not send the verification email. Check Gmail SMTP settings and try again.');
      }
      res.json({ sent: true, message: 'Verification code sent. Check your inbox and spam folder.' });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Could not send verification code.' });
    }
  });

  app.post('/api/auth/email/verify', async (req, res) => {
    try {
      const email = emailOf(req.body.email);
      const purpose = req.body.purpose === 'register' ? 'register' : 'login';
      const code = clean(req.body.otp, 6);
      if (!validEmail(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the email and 6-digit verification code.' });
      const otp = await EmailOtp.findOne({ email, purpose, consumedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
      if (!otp) return res.status(400).json({ error: 'Code expired or not found. Request a new code.' });
      if (otp.attempts >= 5) return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
      const expected = Buffer.from(otp.codeHash, 'hex');
      const actual = Buffer.from(hashCode(email, purpose, code), 'hex');
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        otp.attempts += 1; await otp.save();
        return res.status(400).json({ error: 'Incorrect verification code.' });
      }
      const consumed = await EmailOtp.findOneAndUpdate({ _id: otp._id, consumedAt: null }, { $set: { consumedAt: new Date() } }, { new: true });
      if (!consumed) return res.status(409).json({ error: 'This code has already been used. Request a new code.' });

      if (purpose === 'login') {
        const user = await User.findOne({ email, emailVerified: true });
        if (!user || !['patient','helper'].includes(user.role)) return res.status(404).json({ error: 'No Patient or Care Associate account found for this email.' });
        if (user.isSuspended) return res.status(403).json({ error: 'Your account is suspended. Contact support.' });
        return res.json({ token: sign(user), user: pub(user) });
      }

      const name = clean(req.body.name, 80);
      const phone = clean(req.body.phone, 20);
      const city = clean(req.body.city, 80).toLowerCase();
      const role = req.body.role;
      const upiId = clean(req.body.upiId, 120);
      const referralCode = clean(req.body.referralCode, 20).toUpperCase();
      const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
      if (!name || !phone || !city) return res.status(400).json({ error: 'Please fill in your name, mobile number and city.' });
      if (!['patient','helper'].includes(role)) return res.status(400).json({ error: 'Invalid account type.' });
      if (role === 'helper' && !UPI_RE.test(upiId)) return res.status(400).json({ error: 'Please enter a valid UPI ID.' });
      if (await User.findOne({ phone })) return res.status(409).json({ error: 'This mobile number is already registered.' });
      if (await User.findOne({ email })) return res.status(409).json({ error: 'This email is already registered.' });
      let referrer = null;
      if (referralCode) {
        referrer = await User.findOne({ referralCode, isSuspended: { $ne: true }, $or: [{ role: 'patient' }, { role: 'helper', verified: true }] });
        if (!referrer) return res.status(400).json({ error: 'Referral code is invalid or the referring account is not eligible.' });
      }
      const ownReferralCode = 'CA' + crypto.randomBytes(5).toString('hex').toUpperCase();
      const ownCouponCode = 'SAVE' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const user = await User.create({
        name, phone, email, emailVerified: true, city, role,
        upiId: role === 'helper' ? upiId : undefined,
        referralCode: ownReferralCode, permanentCouponCode: ownCouponCode,
      });
      if (referrer) {
        await Referral.create({ referrer: referrer._id, referredUser: user._id, code: referralCode, status: 'qualified', rewardAmount: 25, payoutStatus: 'not_eligible', note: '₹25 referral reward credited at registration' });
        await User.updateOne({ _id: referrer._id }, { $inc: { referralRewardBalance: 25 } });
      }
      res.json({ token: sign(user), user: pub(user) });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ error: 'This email or mobile number is already registered.' });
      res.status(400).json({ error: error.message || 'Verification failed.' });
    }
  });
}

module.exports = { mountEmailAuthRoutes };
