process.env.TZ = 'Asia/Kolkata'; // for day/night rates and calendar dates
require('dotenv').config();
process.env.TZ = 'Asia/Kolkata';
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Booking, PrivateDocument } = require('./models');
const { calculatePrice } = require('./pricing');
const { createCashfreeOrder, fetchCashfreeOrder, verifyWebhookSignature } = require('./cashfree');
const { sendPushToUser, notifyBooking } = require('./notifications');
const { distanceKm } = require('./phase6');
const { uploadAadhaar, uploadPrivateDocument, deleteAadhaar, downloadAadhaar } = require('./cloudinary');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } })); // retain raw body for Cashfree webhook signature verification

// Vercel may reuse this function instance across requests. Cache initialization
// per warm instance, while allowing a failed connection attempt to be retried.
let initializationPromise;
async function ensureInitialized() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error('JWT_SECRET must be set to a random value of at least 32 characters');
      }
      const adminPhone = cleanText(process.env.ADMIN_PHONE, 20);
      const adminPassword = process.env.ADMIN_PASSWORD || '';
      if (!adminPhone || adminPassword.length < 12) {
        throw new Error('Set ADMIN_PHONE and an ADMIN_PASSWORD of at least 12 characters in the server environment');
      }

      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
      }

      const existingAdmin = await User.findOne({ phone: adminPhone });
      if (!existingAdmin) {
        await User.create({
          name: 'Admin', phone: adminPhone, city: 'all', role: 'admin', verified: true,
          password: await bcrypt.hash(adminPassword, 12),
        });
        console.log('Initial admin account created');
      } else if (existingAdmin.role !== 'admin') {
        throw new Error('ADMIN_PHONE is already registered to a non-admin account; choose a separate admin phone');
      }
    })();
  }
  try {
    await initializationPromise;
  } catch (error) {
    initializationPromise = null;
    throw error;
  }
}

// Initialize MongoDB and the admin account before handling API routes. This is
// required for serverless invocations, where app.listen() is not the entrypoint.
app.use(async (req, res, next) => {
  try {
    await ensureInitialized();
    next();
  } catch (error) {
    console.error('API initialization failed:', error.message);
    res.status(503).json({ error: 'Service temporarily unavailable' });
  }
});

// Lightweight health endpoint for Render and deployment smoke tests.
app.get('/api/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'care-associate-api',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// Aadhaar files are stored as authenticated Cloudinary assets; never expose public delivery URLs.
const imgType = (b) => (b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : null);
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const SERVICES = new Set(['queue', 'report', 'accompany', 'medicine', 'admission', 'insurance', 'other']);
const MAX_BOOKING_HOURS = 240;
const cleanText = (value, max) => String(value || '').trim().slice(0, max);

const sign = (u) => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
const pub = (u) => ({
  id: u._id, name: u.name, phone: u.phone, role: u.role, city: u.city, verified: u.verified, isSuspended: !!u.isSuspended, ratingAverage: u.ratingAverage || 0, ratingCount: u.ratingCount || 0, matchingLocationEnabled: !!u.matchingLocation?.consentedAt,
  available: u.available !== false, leaveDates: u.leaveDates || [],
  upiId: u.upiId || '', aadhaarUploaded: !!u.aadhaarUploaded, aadhaarAt: u.aadhaarAt, language: u.language || 'en',
});
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(400).json({ error: e.message }));

const auth = (...roles) => async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const p = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(p.id);
    if (!req.user) return res.status(401).json({ error: 'Please log in again' });
    if (req.user.isSuspended && req.user.role !== 'admin') return res.status(403).json({ error: 'Your account is suspended. Contact support.' });
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed' });
    next();
  } catch (e) {
    res.status(401).json({ error: 'Please log in again' });
  }
};

// Phase 4 finance routes share the existing authenticated user context.
require('./phase6').mountPhase6Routes(app, auth);
require('./phase4').mountPhase4Routes(app, auth);
require('./phase5').mountPhase5Routes(app, auth);
require('./notificationRoutes').mountNotificationRoutes(app, auth);
require('./training').mountTrainingRoutes(app, auth);
require('./support').mountSupportRoutes(app, auth);

// ---------- Date helpers ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const BUSY = ['accepted', 'on_the_way', 'ongoing'];

function daysBetween(start, end) {
  const days = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  while (d < end && days.length < 120) { days.push(ymd(d)); d.setDate(d.getDate() + 1); }
  return days;
}

function parseRange(s, e) {
  const start = new Date(s), end = new Date(e);
  if (isNaN(start) || isNaN(end)) throw new Error('Invalid date or time');
  if (end <= start) throw new Error('End time must be after start time');
  if (start < new Date(Date.now() - 10 * 60 * 1000)) throw new Error('You cannot book a time in the past');
  if (start > new Date(Date.now() + 100 * 24 * 60 * 60 * 1000)) throw new Error('Bookings can be made up to 3 months in advance');
  if ((end - start) > MAX_BOOKING_HOURS * 60 * 60 * 1000) throw new Error(`Bookings cannot exceed ${MAX_BOOKING_HOURS} hours`);
  return [start, end];
}

// Verified + switched ON + not on leave + no overlapping job
async function freeAssociates(city, start, end, hospitalLocation) {
  const days = daysBetween(start, end);
  const list = await User.find({
    role: 'helper', verified: true, isSuspended: { $ne: true }, available: { $ne: false },
    city: String(city || '').trim().toLowerCase(),
    leaveDates: { $nin: days },
  }).sort('createdAt');
  if (!list.length) return [];
  const busy = await Booking.find({
    status: { $in: BUSY }, helper: { $in: list.map((u) => u._id) },
    startTime: { $lt: end }, endTime: { $gt: start },
  }).distinct('helper');
  const busySet = new Set(busy.map(String));
  return list.filter((u) => !busySet.has(String(u._id))).sort((a, b) => {
    if (hospitalLocation) {
      const da = a.matchingLocation?.latitude != null ? distanceKm(hospitalLocation, a.matchingLocation) : Infinity;
      const db = b.matchingLocation?.latitude != null ? distanceKm(hospitalLocation, b.matchingLocation) : Infinity;
      if (da !== db) return da - db;
    }
    return (Number(b.ratingAverage || 0) - Number(a.ratingAverage || 0)) || (Number(b.ratingCount || 0) - Number(a.ratingCount || 0));
  });
}

// ---------- Auth ----------
app.post('/api/auth/register', wrap(async (req, res) => {
  const name = cleanText(req.body.name, 80);
  const phone = cleanText(req.body.phone, 20);
  const city = cleanText(req.body.city, 80).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const role = req.body.role;
  const upiId = cleanText(req.body.upiId, 120);
  if (!name || !phone || !password || !city) throw new Error('Please fill in all the details');
  if (password.length < 6 || password.length > 128) throw new Error('Password must be between 6 and 128 characters');
  if (!['patient', 'helper'].includes(role)) throw new Error('Invalid role');
  if (role === 'helper' && !UPI_RE.test(upiId)) throw new Error('Please enter a valid UPI ID (for example name@bank)');
  if (await User.findOne({ phone })) throw new Error('This phone number is already registered');
  const user = await User.create({
    name, phone, city, role, upiId: role === 'helper' ? upiId : undefined,
    password: await bcrypt.hash(password, 12),
  });
  res.json({ token: sign(user), user: pub(user) });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const phone = cleanText(req.body.phone, 20);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = await User.findOne({ phone });
  if (!user || !(await bcrypt.compare(password, user.password))) throw new Error('Incorrect phone number or password');
  res.json({ token: sign(user), user: pub(user) });
}));

app.get('/api/me', auth(), (req, res) => res.json(pub(req.user)));

// ---------- Push notification registration ----------
app.post('/api/push-token', auth('patient', 'helper', 'admin'), wrap(async (req, res) => {
  const token = cleanText(req.body.expoPushToken, 200);
  if (!/^Expo(nent)?PushToken\\[.+\\]$/.test(token)) throw new Error('Invalid Expo push token');
  await User.updateOne({ _id: req.user._id }, { $addToSet: { expoPushTokens: token } });
  res.json({ registered: true });
}));

app.delete('/api/push-token', auth('patient', 'helper', 'admin'), wrap(async (req, res) => {
  const token = cleanText(req.body.expoPushToken, 200);
  if (!token) throw new Error('Expo push token is required');
  await User.updateOne({ _id: req.user._id }, { $pull: { expoPushTokens: token } });
  res.json({ removed: true });
}));


const DOCUMENT_CATEGORIES = new Set(['medical_report','prescription','insurance','identity','certificate','other']);
const publicDocument = d => ({id:d._id,category:d.category,title:d.title,format:d.format,mimeType:d.mimeType,sizeBytes:d.sizeBytes,reviewStatus:d.reviewStatus,reviewNote:d.reviewNote,createdAt:d.createdAt,updatedAt:d.updatedAt});

app.get('/api/documents', auth('patient','helper'), wrap(async (req,res) => {
 const items=await PrivateDocument.find({owner:req.user._id}).sort('-createdAt').lean();
 res.json({items:items.map(publicDocument)});
}));

app.post('/api/documents', auth('patient','helper'), wrap(async (req,res) => {
 const title=cleanText(req.body.title,100);
 const category=cleanText(req.body.category,40);
 const image=req.body.image;
 if(!title||!DOCUMENT_CATEGORIES.has(category))throw new Error('Enter a title and valid document category');
 if(typeof image!=='string'||image.length<1000)throw new Error('Choose a valid JPG or PNG image');
 const encoded=image.includes(',')?image.slice(image.indexOf(',')+1):image;
 const buffer=Buffer.from(encoded.split(' ').join('').split('\\n').join(''),'base64');
 if(!buffer.length||buffer.length>5*1024*1024)throw new Error('Document image must be smaller than 5 MB');
 const mimeType=imgType(buffer);
 if(!mimeType)throw new Error('Only JPG and PNG documents are supported');
 const uploaded=await uploadPrivateDocument(buffer,mimeType,req.user._id);
 let doc;
 try {
  doc=await PrivateDocument.create({
   owner:req.user._id,role:req.user.role,category,title,publicId:uploaded.public_id,
   format:uploaded.format||(mimeType==='image/png'?'png':'jpg'),mimeType,sizeBytes:buffer.length,
   reviewStatus:req.user.role==='helper'?'pending':'not_required'
  });
 } catch(error) {
  await deleteAadhaar(uploaded.public_id).catch(()=>{});
  throw error;
 }
 res.status(201).json({document:publicDocument(doc)});
}));

app.get('/api/documents/:id/file', auth('patient','helper'), wrap(async (req,res) => {
 if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({error:'Invalid document'});
 const doc=await PrivateDocument.findOne({_id:req.params.id,owner:req.user._id}).select('+publicId');
 if(!doc)return res.status(404).json({error:'Document not found'});
 const file=await downloadAadhaar(doc.publicId,doc.format);
 res.setHeader('Content-Type',doc.mimeType);
 res.setHeader('Content-Length',file.buffer.length);
 res.setHeader('Content-Disposition','inline; filename="care-document.'+doc.format+'"');
 res.setHeader('Cache-Control','private, no-store');
 res.send(file.buffer);
}));

app.delete('/api/documents/:id', auth('patient','helper'), wrap(async (req,res) => {
 if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({error:'Invalid document'});
 const doc=await PrivateDocument.findOne({_id:req.params.id,owner:req.user._id}).select('+publicId');
 if(!doc)return res.status(404).json({error:'Document not found'});
 await deleteAadhaar(doc.publicId);
 await doc.deleteOne();
 res.json({deleted:true});
}));

app.get('/api/admin/documents', auth('admin'), wrap(async (req,res) => {
 const query={role:'helper'};
 if(['pending','approved','rejected'].includes(req.query.status))query.reviewStatus=req.query.status;
 const items=await PrivateDocument.find(query).populate('owner','name phone city verified').sort('-createdAt').limit(200).lean();
 res.json({items:items.map(d=>({...publicDocument(d),owner:d.owner}))});
}));

app.get('/api/admin/documents/:id/file', auth('admin'), wrap(async (req,res) => {
 if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({error:'Invalid document'});
 const doc=await PrivateDocument.findOne({_id:req.params.id,role:'helper'}).select('+publicId');
 if(!doc)return res.status(404).json({error:'Document not found'});
 const file=await downloadAadhaar(doc.publicId,doc.format);
 res.setHeader('Content-Type',doc.mimeType);
 res.setHeader('Content-Length',file.buffer.length);
 res.setHeader('Content-Disposition','inline; filename="helper-document.'+doc.format+'"');
 res.setHeader('Cache-Control','private, no-store');
 res.send(file.buffer);
}));

app.patch('/api/admin/documents/:id/review', auth('admin'), wrap(async (req,res) => {
 if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({error:'Invalid document'});
 if(!['approved','rejected'].includes(req.body.status))throw new Error('Choose approved or rejected');
 const doc=await PrivateDocument.findOne({_id:req.params.id,role:'helper'});
 if(!doc)return res.status(404).json({error:'Document not found'});
 doc.reviewStatus=req.body.status;
 doc.reviewNote=cleanText(req.body.note,500);
 doc.reviewedBy=req.user._id;
 doc.reviewedAt=new Date();
 await doc.save();
 res.json({document:publicDocument(doc)});
}));

// ---------- Care Associate: profile, availability ----------
app.post('/api/me/upi', auth('helper'), wrap(async (req, res) => {
  const upiId = String(req.body.upiId || '').trim();
  if (!UPI_RE.test(upiId)) throw new Error('Please enter a valid UPI ID (for example name@bank)');
  req.user.upiId = upiId;
  req.user.verified = false; // payout details changed, admin re-checks
  await req.user.save();
  res.json(pub(req.user));
}));

app.post('/api/me/aadhaar', auth('helper'), wrap(async (req, res) => {
  const { image } = req.body;
  if (typeof image !== 'string' || image.length < 1000) throw new Error('Please choose a valid photo');
  const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  if (buf.length > 7 * 1024 * 1024) throw new Error('Photo is too large (max 7 MB)');
  if (!imgType(buf)) throw new Error('Only JPG or PNG photos are allowed');
  const uploaded = await uploadAadhaar(buf, imgType(buf), req.user._id);
  const existingAadhaar = await User.findById(req.user._id).select('+aadhaarPublicId');
  const previousPublicId = existingAadhaar?.aadhaarPublicId;
  req.user.aadhaarPublicId = uploaded.public_id;
  req.user.aadhaarFormat = uploaded.format || (imgType(buf) === 'image/png' ? 'png' : 'jpg');
  req.user.aadhaarUploaded = true;
  req.user.aadhaarAt = new Date();
  req.user.verified = false; // new document, admin re-checks
  try {
    await req.user.save();
  } catch (error) {
    await deleteAadhaar(uploaded.public_id).catch(() => {});
    throw error;
  }
  if (previousPublicId && previousPublicId !== uploaded.public_id) {
    await deleteAadhaar(previousPublicId).catch((error) => console.error('Old Aadhaar cleanup failed:', error.message));
  }
  res.json(pub(req.user));
}));

app.post('/api/me/available', auth('helper'), wrap(async (req, res) => {
  req.user.available = !!req.body.available;
  await req.user.save();
  res.json(pub(req.user));
}));

app.post('/api/me/leave', auth('helper'), wrap(async (req, res) => {
  const { date } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Invalid date');
  const has = req.user.leaveDates.includes(date);
  req.user.leaveDates = has ? req.user.leaveDates.filter((d) => d !== date) : [...req.user.leaveDates, date];
  await req.user.save();
  res.json(pub(req.user));
}));

// ---------- Price + availability ----------
app.post('/api/price', wrap(async (req, res) => {
  res.json(calculatePrice(req.body.startTime, req.body.endTime));
}));

app.get('/api/availability', wrap(async (req, res) => {
  const city = cleanText(req.query.city, 80).toLowerCase();
  if (!city) throw new Error('Please provide a city');
  const [start, end] = parseRange(req.query.startTime, req.query.endTime);
  const free = await freeAssociates(city, start, end);
  res.json(free.map((u) => ({ id: u._id, name: u.name })));
}));

// ---------- Bookings ----------
// Create a booking in an unpaid state, then create its Cashfree checkout session.
app.post('/api/bookings/create-payment', auth('patient'), wrap(async (req, res) => {
  const service = req.body.service;
  const hospital = cleanText(req.body.hospital, 160);
  const city = cleanText(req.body.city, 80).toLowerCase();
  const details = cleanText(req.body.details, 1000);
  const helperId = req.body.helperId;
  const familyProfile = req.body.familyProfileId ? req.user.familyProfiles.id(req.body.familyProfileId) : null;
  if (req.body.familyProfileId && !familyProfile) throw new Error('Selected family profile was not found');
  if (!SERVICES.has(service)) throw new Error('Please choose a valid service');
  if (!hospital || !city) throw new Error('Hospital and city are required');
  const [start, end] = parseRange(req.body.startTime, req.body.endTime);
  const price = calculatePrice(start, end);
  const free = await freeAssociates(city, start, end);
  const chosen = helperId ? free.find((u) => String(u._id) === String(helperId)) : free[0];
  if (helperId && !chosen) throw new Error('This Care Associate is not free at that time, please choose another');

  const booking = await Booking.create({
    patient: req.user._id, service, hospital, city, details,
    patientProfile: familyProfile ? { name: familyProfile.name, relation: familyProfile.relation, phone: familyProfile.phone, age: familyProfile.age, notes: familyProfile.notes } : undefined,
    startTime: start, endTime: end, hours: price.totalHours, amount: price.total,
    helper: chosen ? chosen._id : undefined,
    status: 'awaiting_payment',
    paymentStatus: 'pending',
    paymentAmount: price.total,
    paymentCurrency: 'INR',
  });

  try {
    const orderId = `ca_${booking._id}`;
    const order = await createCashfreeOrder({
      orderId,
      amount: price.total,
      customerId: req.user._id,
      customerPhone: req.user.phone,
    });
    booking.cashfreeOrderId = order.order_id || orderId;
    booking.paymentSessionId = order.payment_session_id;
    await booking.save();
    res.json({
      bookingId: booking._id,
      orderId: booking.cashfreeOrderId,
      paymentSessionId: order.payment_session_id,
      environment: order.environment,
      amount: price.total,
      currency: 'INR',
    });
  } catch (error) {
    await Booking.deleteOne({ _id: booking._id, paymentStatus: 'pending' });
    throw error;
  }
}));

// The old unpaid booking endpoint is intentionally disabled to prevent bypassing checkout.
app.post('/api/bookings', auth('patient'), (req, res) => {
  res.status(410).json({ error: 'Online payment is required. Use the Cashfree checkout flow.' });
});

// Verify payment directly with Cashfree; never trust the mobile callback alone.
async function syncCashfreePayment(orderId) {
  const booking = await Booking.findOne({ cashfreeOrderId: orderId });
  if (!booking) throw new Error('Booking for this Cashfree order was not found');
  const order = await fetchCashfreeOrder(orderId);
  if (Number(order.order_amount) !== Number(booking.amount)) {
    throw new Error('Cashfree order amount does not match the booking amount');
  }
  if (order.order_status === 'PAID') {
    if (booking.paymentStatus !== 'paid') {
      booking.paymentStatus = 'paid';
      booking.paymentAt = new Date();
      booking.paymentCurrency = order.order_currency || 'INR';
      let nextStatus = booking.helper ? 'accepted' : 'pending';
      if (booking.helper) {
        const clash = await Booking.findOne({
          _id: { $ne: booking._id }, helper: booking.helper, status: { $in: BUSY },
          startTime: { $lt: booking.endTime }, endTime: { $gt: booking.startTime },
        });
        if (clash) { booking.helper = undefined; nextStatus = 'pending'; }
      }
      if (booking.status !== 'cancelled') booking.status = nextStatus;
      await booking.save();
      await notifyBooking(booking, booking.patient, 'Payment confirmed', 'Your Care Associate booking is now confirmed.');
      if (booking.helper) {
        await notifyBooking(booking, booking.helper, 'New paid booking', 'A patient booking has been confirmed for you.');
      } else {
        const available = await freeAssociates(booking.city, booking.startTime, booking.endTime);
        await Promise.all(available.map((associate) => notifyBooking(booking, associate._id, 'New patient request', 'A paid booking is available in your city. Open Jobs to review it.')));
      }
    }
  } else if (['EXPIRED', 'TERMINATED'].includes(order.order_status) && booking.paymentStatus !== 'paid') {
    booking.paymentStatus = 'failed';
    await booking.save();
  }
  return { paymentStatus: booking.paymentStatus, bookingStatus: booking.status, amount: booking.amount };
}

app.post('/api/payments/verify', auth('patient'), wrap(async (req, res) => {
  const orderId = cleanText(req.body.orderId, 60);
  if (!orderId) throw new Error('Cashfree order ID is required');
  const booking = await Booking.findOne({ cashfreeOrderId: orderId, patient: req.user._id });
  if (!booking) throw new Error('Payment order not found');
  res.json(await syncCashfreePayment(orderId));
}));

// Cashfree server-to-server webhook: verify signature on the exact raw request body.
app.post('/api/payments/cashfree/webhook', wrap(async (req, res) => {
  const valid = verifyWebhookSignature(
    req.headers['x-webhook-signature'],
    req.headers['x-webhook-timestamp'],
    req.rawBody
  );
  if (!valid) return res.status(401).json({ error: 'Invalid Cashfree webhook signature' });
  const orderId = req.body?.data?.order?.order_id || req.body?.data?.payment?.order_id;
  if (orderId) await syncCashfreePayment(String(orderId));
  res.json({ received: true });
}));

app.get('/api/bookings/mine', auth('patient', 'helper', 'admin'), wrap(async (req, res) => {
  const isAssoc = req.user.role === 'helper';
  const list = await Booking.find(isAssoc ? { helper: req.user._id } : { patient: req.user._id })
    .populate('helper', 'name phone').populate('patient', 'name phone').sort('startTime');
  res.json(list);
}));

app.get('/api/bookings/open', auth('helper'), wrap(async (req, res) => {
  const list = await Booking.find({ status: 'pending', paymentStatus: 'paid', city: req.user.city, startTime: { $gte: new Date() } })
    .populate('patient', 'name').sort('startTime');
  res.json(list);
}));

app.post('/api/bookings/:id/accept', auth('helper'), wrap(async (req, res) => {
  if (!req.user.verified) throw new Error('Your account must be verified by the admin first');
  if (req.user.available === false) throw new Error('Switch your availability on before accepting a job');
  const b0 = await Booking.findOne({ _id: req.params.id, status: 'pending', paymentStatus: 'paid' });
  if (!b0) throw new Error('This booking is no longer available');
  if (String(req.user.city || '').trim().toLowerCase() !== String(b0.city || '').trim().toLowerCase()) {
    throw new Error('You can only accept jobs in your registered city');
  }
  const leaveDays = daysBetween(b0.startTime, b0.endTime);
  if (leaveDays.some((day) => (req.user.leaveDates || []).includes(day))) throw new Error('You have marked leave during this booking');
  if (b0.startTime < new Date()) throw new Error('This booking has already started');
  const clash = await Booking.findOne({
    helper: req.user._id, status: { $in: BUSY }, startTime: { $lt: b0.endTime }, endTime: { $gt: b0.startTime },
  });
  if (clash) throw new Error('You already have another job at that time');
  const b = await Booking.findOneAndUpdate(
    { _id: req.params.id, status: 'pending', paymentStatus: 'paid' },
    { helper: req.user._id, status: 'accepted' }, { new: true });
  if (!b) throw new Error('This booking is no longer available');
  await notifyBooking(b, b.patient, 'Care Associate confirmed', 'Your Care Associate has accepted the booking.');
  await notifyBooking(b, req.user._id, 'Booking accepted', 'You have accepted a patient booking.');
  res.json(b);
}));

// ---------- Associate-provided arrival ETA ----------
app.post('/api/bookings/:id/eta', auth('helper'), wrap(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, helper: req.user._id, status: { $in: ['accepted', 'on_the_way'] }, paymentStatus: 'paid' });
  if (!booking) throw new Error('ETA can be shared only for your confirmed booking before duty starts');
  const minutes = Number(req.body.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) throw new Error('ETA must be between 1 and 600 minutes');
  booking.etaMinutes = minutes;
  booking.etaUpdatedAt = new Date();
  await booking.save();
  await notifyBooking(booking, booking.patient, 'Care Associate arrival ETA', 'Your Care Associate shared an ETA of ' + minutes + ' minutes.');
  res.json({ etaMinutes: minutes, etaUpdatedAt: booking.etaUpdatedAt });
}));

// ---------- Secure booking chat ----------
async function participantBooking(req, bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking || ![String(booking.patient), String(booking.helper)].includes(String(req.user._id))) {
    throw new Error('Booking not found or access denied');
  }
  if (!['accepted', 'on_the_way', 'ongoing'].includes(booking.status)) throw new Error('Chat is available only for confirmed active bookings');
  return booking;
}

app.get('/api/bookings/:id/chat', auth('patient', 'helper', 'admin'), wrap(async (req, res) => {
  const booking = await participantBooking(req, req.params.id);
  const messages = await Booking.populate(booking.chatMessages.slice(-100), { path: 'sender', select: 'name role' });
  res.json(messages);
}));

app.post('/api/bookings/:id/chat', auth('patient', 'helper', 'admin'), wrap(async (req, res) => {
  const booking = await participantBooking(req, req.params.id);
  const message = cleanText(req.body.text, 2000);
  if (!message) throw new Error('Please type a message');
  booking.chatMessages.push({ sender: req.user._id, text: message });
  if (booking.chatMessages.length > 200) booking.chatMessages = booking.chatMessages.slice(-200);
  await booking.save();
  const recipient = String(booking.patient) === String(req.user._id) ? booking.helper : booking.patient;
  await sendPushToUser(recipient, 'New booking message', message.slice(0, 100), { bookingId: String(booking._id), screen: 'chat' });
  const saved = booking.chatMessages[booking.chatMessages.length - 1];
  res.json({ ...saved.toObject(), sender: { _id: req.user._id, name: req.user.name, role: req.user.role } });
}));

// ---------- Private live location: helper publishes only while duty is active ----------
app.post('/api/bookings/:id/location', auth('helper'), wrap(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, helper: req.user._id, status: 'ongoing', paymentStatus: 'paid' });
  if (!booking) throw new Error('Live location is available only during your active duty');
  const latitude = Number(req.body.latitude), longitude = Number(req.body.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Invalid location coordinates');
  }
  booking.liveLocation = {
    latitude, longitude,
    accuracy: Number.isFinite(Number(req.body.accuracy)) ? Number(req.body.accuracy) : undefined,
    heading: Number.isFinite(Number(req.body.heading)) ? Number(req.body.heading) : undefined,
    speed: Number.isFinite(Number(req.body.speed)) ? Number(req.body.speed) : undefined,
    updatedAt: new Date(),
  };
  await booking.save();
  res.json({ updated: true, updatedAt: booking.liveLocation.updatedAt });
}));

app.get('/api/bookings/:id/location', auth('patient', 'helper', 'admin'), wrap(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking || ![String(booking.patient), String(booking.helper)].includes(String(req.user._id))) {
    throw new Error('Booking not found or access denied');
  }
  if (booking.status !== 'ongoing' || !booking.liveLocation?.updatedAt) {
    return res.json({ active: false, location: null });
  }
  res.json({ active: true, location: booking.liveLocation });
}));

// Care Associate switches ON duty when joining the patient
app.post('/api/bookings/:id/start', auth('helper'), wrap(async (req, res) => {
  if (!req.user.verified) throw new Error('Your account must be verified by the admin first');
  if (await Booking.findOne({ helper: req.user._id, status: 'ongoing' })) {
    throw new Error('You already have a job in progress. Switch it off first');
  }
  const b0 = await Booking.findOne({ _id: req.params.id, helper: req.user._id, status: { $in: ['accepted', 'on_the_way'] }, paymentStatus: 'paid' });
  if (!b0) throw new Error('Booking not found');
  if (Date.now() < b0.startTime.getTime() - 60 * 60 * 1000) {
    throw new Error('You can switch on duty only within 1 hour of the scheduled start time');
  }
  if (Date.now() >= b0.endTime.getTime()) throw new Error('The scheduled booking time has already ended');
  const b = await Booking.findOneAndUpdate(
    { _id: b0._id, status: { $in: ['accepted', 'on_the_way'] } }, { status: 'ongoing', actualStart: new Date() }, { new: true });
  if (!b) throw new Error('Booking not found');
  await notifyBooking(b, b.patient, 'Duty started', 'Your Care Associate has started the duty.');
  res.json(b);
}));

// ...and OFF duty as soon as the work is finished
app.post('/api/bookings/:id/end', auth('helper'), wrap(async (req, res) => {
  const b0 = await Booking.findOne({ _id: req.params.id, helper: req.user._id, status: 'ongoing' });
  if (!b0) throw new Error('This job is not in progress');
  const now = new Date();
  const minutes = Math.max(1, Math.round((now - b0.actualStart) / 60000));
  const b = await Booking.findOneAndUpdate(
    { _id: b0._id, status: 'ongoing' },
    { status: 'completed', actualEnd: now, actualMinutes: minutes, liveLocation: undefined }, { new: true });
  if (!b) throw new Error('This job has already been completed or changed');
  await notifyBooking(b, b.patient, 'Duty completed', 'Your Care Associate has completed the duty.');
  await notifyBooking(b, req.user._id, 'Duty completed', 'Your duty has been marked complete.');
  res.json(b);
}));

app.post('/api/bookings/:id/cancel', auth('patient'), wrap(async (req, res) => {
  const existing = await Booking.findOne({ _id: req.params.id, patient: req.user._id });
  if (existing?.paymentStatus === 'paid') {
    throw new Error('This booking has already been paid. Contact support to arrange cancellation and refund.');
  }
  const b = await Booking.findOneAndUpdate(
    { _id: req.params.id, patient: req.user._id, status: { $in: ['awaiting_payment', 'pending', 'accepted'] }, paymentStatus: { $ne: 'paid' } },
    { status: 'cancelled' }, { new: true });
  if (!b) throw new Error('This booking cannot be cancelled');
  res.json(b);
}));

// ---------- Admin ----------
app.get('/api/admin/users', auth('admin'), wrap(async (req, res) => {
  res.json((await User.find({ role: { $ne: 'admin' } }).sort('-createdAt')).map(pub));
}));

app.get('/api/admin/users/:id/aadhaar', auth('admin'), wrap(async (req, res) => {
  if (!/^[a-f0-9]{24}$/.test(req.params.id)) throw new Error('Invalid user');
  const user = await User.findById(req.params.id).select('+aadhaarPublicId +aadhaarFormat');
  if (!user || !user.aadhaarUploaded || !user.aadhaarPublicId) throw new Error('No Aadhaar uploaded');
  const document = await downloadAadhaar(user.aadhaarPublicId, user.aadhaarFormat);
  res.set('Content-Type', document.contentType);
  res.set('Content-Disposition', 'inline; filename="aadhaar-document"');
  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(document.buffer);
}));

app.delete('/api/admin/users/:id/aadhaar', auth('admin'), wrap(async (req, res) => {
  if (!/^[a-f0-9]{24}$/.test(req.params.id)) throw new Error('Invalid user');
  const user = await User.findById(req.params.id).select('+aadhaarPublicId +aadhaarFormat');
  if (!user || !user.aadhaarUploaded || !user.aadhaarPublicId) throw new Error('No Aadhaar uploaded');
  const publicId = user.aadhaarPublicId;
  await deleteAadhaar(publicId);
  user.aadhaarPublicId = undefined;
  user.aadhaarFormat = undefined;
  user.aadhaarUploaded = false;
  user.aadhaarAt = undefined;
  user.verified = false;
  await user.save();
  res.json({ deleted: true });
}));

app.post('/api/admin/users/:id/verify', auth('admin'), wrap(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw new Error('User not found');
  if (u.role !== 'helper') throw new Error('Only Care Associate accounts can be verified');
  if (!u.verified && (!u.aadhaarUploaded || !u.upiId)) {
    throw new Error('Aadhaar and UPI ID are required before verification');
  }
  u.verified = !u.verified;
  await u.save();
  res.json(pub(u));
}));


app.post('/api/admin/bookings/:id/assign', auth('admin'), wrap(async (req,res) => {
 const helperId=String(req.body.helperId||'');
 if(!mongoose.isValidObjectId(req.params.id)||!mongoose.isValidObjectId(helperId))throw new Error('Choose a valid booking and Care Associate');
 const booking=await Booking.findOne({_id:req.params.id,status:'pending',paymentStatus:'paid',helper:{$exists:false}});
 if(!booking)throw new Error('Only paid, unassigned pending bookings can be assigned');
 const helper=await User.findOne({_id:helperId,role:'helper',verified:true,isSuspended:{$ne:true},available:{$ne:false}});
 if(!helper)throw new Error('Care Associate must be verified, active and available');
 if(String(helper.city||'').trim().toLowerCase()!==String(booking.city||'').trim().toLowerCase())throw new Error('Care Associate must be registered in the booking city');
 if(daysBetween(booking.startTime,booking.endTime).some(day=>(helper.leaveDates||[]).includes(day)))throw new Error('Care Associate has leave during this booking');
 if(booking.startTime<new Date())throw new Error('This booking has already started');
 const clash=await Booking.findOne({helper:helper._id,status:{$in:BUSY},startTime:{$lt:booking.endTime},endTime:{$gt:booking.startTime}});
 if(clash)throw new Error('Care Associate already has an overlapping active booking');
 const updated=await Booking.findOneAndUpdate({_id:booking._id,status:'pending',paymentStatus:'paid',helper:{$exists:false}},{$set:{helper:helper._id,status:'accepted'}},{new:true}).populate('patient','name phone').populate('helper','name phone');
 if(!updated)throw new Error('Booking was changed by another request; refresh and try again');
 await notifyBooking(updated,updated.patient._id,'Care Associate assigned','A Care Associate has been assigned to your booking.');
 await notifyBooking(updated,helper._id,'New booking assigned','An administrator assigned a patient booking to you.');
 res.json({booking:updated});
}));

app.post('/api/admin/bookings/:id/unassign', auth('admin'), wrap(async(req,res)=>{
 const booking=await Booking.findOne({_id:req.params.id,status:'accepted',paymentStatus:'paid'});
 if(!booking||!booking.helper)return res.status(409).json({error:'Only an accepted booking can be reassigned'});
 const previous=booking.helper;
 booking.helper=undefined;
 booking.status='pending';
 await booking.save();
 await notifyBooking(booking,booking.patient,'Care Associate reassignment','Your booking is being reassigned by the operations team.');
 await notifyBooking(booking,previous,'Booking reassigned','An administrator reassigned this booking.');
 res.json({booking});
}));

app.get('/api/admin/bookings', auth('admin'), wrap(async (req, res) => {
  const list = await Booking.find().populate('patient', 'name phone').populate('helper', 'name phone upiId').sort('-createdAt');
  const revenue = list.filter((b) => b.status === 'completed' && b.paymentStatus === 'paid').reduce((s, b) => s + b.amount, 0);
  res.json({ revenue, bookings: list });
}));

// ---------- Start ----------
async function start() {
  await ensureInitialized();
  app.listen(process.env.PORT || 5001, () => console.log('Server is running on port', process.env.PORT || 5001));
}

if (require.main === module) {
  start().catch((e) => { console.error('Startup error:', e.message); process.exit(1); });
}

// Vercel's Express runtime expects the Express application itself as the
// CommonJS export. Attach named helpers for existing tests and local tooling.
app.app = app;
app.start = start;
app.ensureInitialized = ensureInitialized;
app.parseRange = parseRange;
app.freeAssociates = freeAssociates;
module.exports = app;
