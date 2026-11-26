const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['patient', 'helper', 'admin'], default: 'patient' },
  city: { type: String, trim: true, lowercase: true },
  verified: { type: Boolean, default: false },
  available: { type: Boolean, default: true },
  leaveDates: { type: [String], default: [] },
  upiId: { type: String, trim: true },
  aadhaarUploaded: { type: Boolean, default: false },
  aadhaarAt: Date,
  expoPushTokens: { type: [String], default: [] },
}, { timestamps: true });

const chatMessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});

const locationSchema = new mongoose.Schema({
  latitude: { type: Number, min: -90, max: 90 },
  longitude: { type: Number, min: -180, max: 180 },
  accuracy: Number,
  heading: Number,
  speed: Number,
  updatedAt: Date,
}, { _id: false });

const bookingSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  helper: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  service: {
    type: String, required: true,
    enum: ['queue', 'report', 'accompany', 'medicine', 'admission', 'insurance', 'other'],
  },
  hospital: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true, lowercase: true },
  details: { type: String, default: '' },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  hours: Number,
  amount: Number,
  status: { type: String, enum: ['awaiting_payment', 'pending', 'accepted', 'ongoing', 'completed', 'cancelled'], default: 'pending' },
  paymentStatus: { type: String, enum: ['not_started', 'pending', 'paid', 'failed', 'refunded'], default: 'not_started' },
  cashfreeOrderId: { type: String, unique: true, sparse: true },
  paymentSessionId: { type: String, select: false },
  cashfreePaymentId: String,
  paymentAmount: Number,
  paymentCurrency: { type: String, default: 'INR' },
  paymentAt: Date,
  actualStart: Date,
  actualEnd: Date,
  actualMinutes: Number,
  chatMessages: { type: [chatMessageSchema], default: [] },
  liveLocation: { type: locationSchema, default: undefined },
  etaMinutes: { type: Number, min: 1, max: 600 },
  etaUpdatedAt: Date,
}, { timestamps: true });

module.exports = {
  User: mongoose.model('User', userSchema),
  Booking: mongoose.model('Booking', bookingSchema),
};
