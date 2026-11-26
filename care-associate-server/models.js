const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  // 'helper' = Care Associate (kept as the DB value so old data keeps working)
  role: { type: String, enum: ['patient', 'helper', 'admin'], default: 'patient' },
  city: { type: String, trim: true, lowercase: true },
  verified: { type: Boolean, default: false },
  available: { type: Boolean, default: true },
  leaveDates: { type: [String], default: [] },
  upiId: { type: String, trim: true },               // payout UPI ID of the Care Associate
  aadhaarUploaded: { type: Boolean, default: false }, // masked Aadhaar photo is stored in uploads/aadhaar
  aadhaarAt: Date,
}, { timestamps: true });

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
  status: { type: String, enum: ['pending', 'accepted', 'ongoing', 'completed', 'cancelled'], default: 'pending' },
  actualStart: Date,     // when the Care Associate switched ON duty
  actualEnd: Date,       // when the Care Associate switched OFF duty
  actualMinutes: Number, // time actually spent with the patient
}, { timestamps: true });

module.exports = {
  User: mongoose.model('User', userSchema),
  Booking: mongoose.model('Booking', bookingSchema),
};
