process.env.TZ = 'Asia/Kolkata'; // for day/night rates and calendar dates
require('dotenv').config();
process.env.TZ = 'Asia/Kolkata';
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Booking } = require('./models');
const { calculatePrice } = require('./pricing');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // masked Aadhaar photo comes as base64

// Aadhaar photos are stored privately here and are served ONLY to the admin
const UPLOAD_DIR = path.join(__dirname, 'uploads', 'aadhaar');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const imgType = (b) => (b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : null);
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const SERVICES = new Set(['queue', 'report', 'accompany', 'medicine', 'admission', 'insurance', 'other']);
const MAX_BOOKING_HOURS = 240;
const cleanText = (value, max) => String(value || '').trim().slice(0, max);

const sign = (u) => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
const pub = (u) => ({
  id: u._id, name: u.name, phone: u.phone, role: u.role, city: u.city, verified: u.verified,
  available: u.available !== false, leaveDates: u.leaveDates || [],
  upiId: u.upiId || '', aadhaarUploaded: !!u.aadhaarUploaded, aadhaarAt: u.aadhaarAt,
});
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(400).json({ error: e.message }));

const auth = (...roles) => async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const p = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(p.id);
    if (!req.user) return res.status(401).json({ error: 'Please log in again' });
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed' });
    next();
  } catch (e) {
    res.status(401).json({ error: 'Please log in again' });
  }
};

// ---------- Date helpers ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const BUSY = ['accepted', 'ongoing'];

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
async function freeAssociates(city, start, end) {
  const days = daysBetween(start, end);
  const list = await User.find({
    role: 'helper', verified: true, available: { $ne: false },
    city: String(city || '').trim().toLowerCase(),
    leaveDates: { $nin: days },
  }).sort('createdAt');
  if (!list.length) return [];
  const busy = await Booking.find({
    status: { $in: BUSY }, helper: { $in: list.map((u) => u._id) },
    startTime: { $lt: end }, endTime: { $gt: start },
  }).distinct('helper');
  const busySet = new Set(busy.map(String));
  return list.filter((u) => !busySet.has(String(u._id)));
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
  await fs.promises.writeFile(path.join(UPLOAD_DIR, `${req.user._id}.img`), buf);
  req.user.aadhaarUploaded = true;
  req.user.aadhaarAt = new Date();
  req.user.verified = false; // new document, admin re-checks
  await req.user.save();
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
app.post('/api/bookings', auth('patient'), wrap(async (req, res) => {
  const service = req.body.service;
  const hospital = cleanText(req.body.hospital, 160);
  const city = cleanText(req.body.city, 80).toLowerCase();
  const details = cleanText(req.body.details, 1000);
  const helperId = req.body.helperId;
  if (!SERVICES.has(service)) throw new Error('Please choose a valid service');
  if (!hospital || !city) throw new Error('Hospital and city are required');
  const [start, end] = parseRange(req.body.startTime, req.body.endTime);
  const price = calculatePrice(start, end);
  const free = await freeAssociates(city, start, end);
  const chosen = helperId ? free.find((u) => String(u._id) === String(helperId)) : free[0];
  if (helperId && !chosen) throw new Error('This Care Associate is not free at that time, please choose another');

  const booking = await Booking.create({
    patient: req.user._id, service, hospital, city, details,
    startTime: start, endTime: end, hours: price.totalHours, amount: price.total,
    helper: chosen ? chosen._id : undefined,
    status: chosen ? 'accepted' : 'pending',
  });
  res.json(booking);
}));

app.get('/api/bookings/mine', auth('patient', 'helper'), wrap(async (req, res) => {
  const isAssoc = req.user.role === 'helper';
  const list = await Booking.find(isAssoc ? { helper: req.user._id } : { patient: req.user._id })
    .populate('helper', 'name phone').populate('patient', 'name phone').sort('startTime');
  res.json(list);
}));

app.get('/api/bookings/open', auth('helper'), wrap(async (req, res) => {
  const list = await Booking.find({ status: 'pending', city: req.user.city, startTime: { $gte: new Date() } })
    .populate('patient', 'name').sort('startTime');
  res.json(list);
}));

app.post('/api/bookings/:id/accept', auth('helper'), wrap(async (req, res) => {
  if (!req.user.verified) throw new Error('Your account must be verified by the admin first');
  if (req.user.available === false) throw new Error('Switch your availability on before accepting a job');
  const b0 = await Booking.findOne({ _id: req.params.id, status: 'pending' });
  if (!b0) throw new Error('This booking is no longer available');
  if (String(req.user.city || '').trim().toLowerCase() !== String(b0.city || '').trim().toLowerCase()) {
    throw new Error('You can only accept jobs in your registered city');
  }
  const leaveDays = daysBetween(b0.startTime, b0.endTime);
  if (leaveDays.some((day) => req.user.leaveDates.includes(day))) throw new Error('You have marked leave during this booking');
  if (b0.startTime < new Date()) throw new Error('This booking has already started');
  const clash = await Booking.findOne({
    helper: req.user._id, status: { $in: BUSY }, startTime: { $lt: b0.endTime }, endTime: { $gt: b0.startTime },
  });
  if (clash) throw new Error('You already have another job at that time');
  const b = await Booking.findOneAndUpdate(
    { _id: req.params.id, status: 'pending' },
    { helper: req.user._id, status: 'accepted' }, { new: true });
  if (!b) throw new Error('This booking is no longer available');
  res.json(b);
}));

// Care Associate switches ON duty when joining the patient
app.post('/api/bookings/:id/start', auth('helper'), wrap(async (req, res) => {
  if (!req.user.verified) throw new Error('Your account must be verified by the admin first');
  if (await Booking.findOne({ helper: req.user._id, status: 'ongoing' })) {
    throw new Error('You already have a job in progress. Switch it off first');
  }
  const b0 = await Booking.findOne({ _id: req.params.id, helper: req.user._id, status: 'accepted' });
  if (!b0) throw new Error('Booking not found');
  if (Date.now() < b0.startTime.getTime() - 60 * 60 * 1000) {
    throw new Error('You can switch on duty only within 1 hour of the scheduled start time');
  }
  const b = await Booking.findOneAndUpdate(
    { _id: b0._id, status: 'accepted' }, { status: 'ongoing', actualStart: new Date() }, { new: true });
  if (!b) throw new Error('Booking not found');
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
    { status: 'completed', actualEnd: now, actualMinutes: minutes }, { new: true });
  if (!b) throw new Error('This job has already been completed or changed');
  res.json(b);
}));

app.post('/api/bookings/:id/cancel', auth('patient'), wrap(async (req, res) => {
  const b = await Booking.findOneAndUpdate(
    { _id: req.params.id, patient: req.user._id, status: { $in: ['pending', 'accepted'] } },
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
  let buf;
  try { buf = await fs.promises.readFile(path.join(UPLOAD_DIR, `${req.params.id}.img`)); }
  catch (e) { throw new Error('No Aadhaar uploaded'); }
  res.set('Content-Type', imgType(buf) || 'application/octet-stream');
  res.set('Cache-Control', 'private, no-store');
  res.send(buf);
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

app.get('/api/admin/bookings', auth('admin'), wrap(async (req, res) => {
  const list = await Booking.find().populate('patient', 'name phone').populate('helper', 'name phone upiId').sort('-createdAt');
  const revenue = list.filter((b) => b.status === 'completed').reduce((s, b) => s + b.amount, 0);
  res.json({ revenue, bookings: list });
}));

// ---------- Start ----------
async function start() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set to a random value of at least 32 characters');
  }
  const adminPhone = cleanText(process.env.ADMIN_PHONE, 20);
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminPhone || adminPassword.length < 12) {
    throw new Error('Set ADMIN_PHONE and an ADMIN_PASSWORD of at least 12 characters in the server environment');
  }

  await mongoose.connect(process.env.MONGO_URI);
  const existingAdmin = await User.findOne({ phone: adminPhone });
  if (!existingAdmin) {
    await User.create({
      name: 'Admin', phone: adminPhone, city: 'all', role: 'admin', verified: true,
      password: await bcrypt.hash(adminPassword, 12),
    });
    console.log('Initial admin account created');
  } else if (existingAdmin.role !== 'admin') {
    throw new Error('ADMIN_PHONE is already registered to a non-admin account; choose a separate admin phone');
  } else {
    console.log('Admin account ready');
  }

  app.listen(process.env.PORT || 5001, () => console.log('Server is running on port', process.env.PORT || 5001));
}

if (require.main === module) {
  start().catch((e) => { console.error('Startup error:', e.message); process.exit(1); });
}

module.exports = { app, start, parseRange, freeAssociates };
