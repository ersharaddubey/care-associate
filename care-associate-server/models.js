const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
 name:{type:String,required:true,trim:true}, phone:{type:String,required:true,unique:true,trim:true}, password:{type:String,required:true},
 role:{type:String,enum:['patient','helper','admin'],default:'patient'}, city:{type:String,trim:true,lowercase:true},
 verified:{type:Boolean,default:false}, available:{type:Boolean,default:true}, leaveDates:{type:[String],default:[]}, upiId:{type:String,trim:true},
 aadhaarUploaded:{type:Boolean,default:false}, aadhaarAt:Date, expoPushTokens:{type:[String],default:[]}
},{timestamps:true});
const chatMessageSchema=new mongoose.Schema({sender:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},text:{type:String,required:true,trim:true,maxlength:2000},createdAt:{type:Date,default:Date.now}});
const locationSchema=new mongoose.Schema({latitude:{type:Number,min:-90,max:90},longitude:{type:Number,min:-180,max:180},accuracy:Number,heading:Number,speed:Number,updatedAt:Date},{_id:false});
const refundSchema=new mongoose.Schema({refundId:{type:String,required:true},amount:{type:Number,required:true,min:0.01},status:{type:String,enum:['PENDING','SUCCESS','FAILED'],default:'PENDING'},reason:{type:String,default:''},cashfreeStatus:String,createdAt:{type:Date,default:Date.now},updatedAt:Date},{_id:false});
const bookingSchema=new mongoose.Schema({
 patient:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},helper:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
 service:{type:String,required:true,enum:['queue','report','accompany','medicine','admission','insurance','other']},
 hospital:{type:String,required:true,trim:true},city:{type:String,required:true,trim:true,lowercase:true},details:{type:String,default:''},
 startTime:{type:Date,required:true},endTime:{type:Date,required:true},hours:Number,amount:Number,
 status:{type:String,enum:['awaiting_payment','pending','accepted','ongoing','completed','cancelled'],default:'pending'},
 paymentStatus:{type:String,enum:['not_started','pending','paid','failed','refunded'],default:'not_started'},
 cashfreeOrderId:{type:String,unique:true,sparse:true},paymentSessionId:{type:String,select:false},cashfreePaymentId:String,
 paymentAmount:Number,paymentCurrency:{type:String,default:'INR'},paymentAt:Date,
 refunds:{type:[refundSchema],default:[]},commissionBps:{type:Number,min:0,max:10000},platformFee:{type:Number,min:0},
 helperNetAmount:{type:Number,min:0},financialsCalculatedAt:Date,
 actualStart:Date,actualEnd:Date,actualMinutes:Number,chatMessages:{type:[chatMessageSchema],default:[]},
 liveLocation:{type:locationSchema,default:undefined},etaMinutes:{type:Number,min:1,max:600},etaUpdatedAt:Date
},{timestamps:true});

// Freeze the approved commission rate when a paid associate duty is completed.
// If the rate is not configured yet, leave the snapshot empty; finance reports
// will remain unavailable until the owner configures the rate.
bookingSchema.pre('save', function () {
 if (this.isModified('status') && this.status === 'completed' && this.commissionBps == null) {
  const raw = process.env.PLATFORM_COMMISSION_BPS;
  const bps = Number(raw);
  if (raw !== undefined && raw !== '' && Number.isInteger(bps) && bps >= 0 && bps <= 10000) {
   const gross = Number(this.amount || 0);
   this.commissionBps = bps;
   this.platformFee = Math.round((gross * bps / 10000 + Number.EPSILON) * 100) / 100;
   this.helperNetAmount = Math.max(0, Math.round((gross - this.platformFee + Number.EPSILON) * 100) / 100);
   this.financialsCalculatedAt = new Date();
  }
 }
});
bookingSchema.pre('findOneAndUpdate', function () {
 const update = this.getUpdate() || {};
 const status = update.status || update.$set?.status;
 const currentCommission = update.commissionBps ?? update.$set?.commissionBps;
 const raw = process.env.PLATFORM_COMMISSION_BPS;
 const bps = Number(raw);
 if (status === 'completed' && currentCommission == null && raw !== undefined && raw !== '' && Number.isInteger(bps) && bps >= 0 && bps <= 10000) {
  const amount = Number(update.amount ?? update.$set?.amount ?? 0);
  const fee = Math.round((amount * bps / 10000 + Number.EPSILON) * 100) / 100;
  const snapshot = { commissionBps: bps, platformFee: fee, helperNetAmount: Math.max(0, Math.round((amount - fee + Number.EPSILON) * 100) / 100), financialsCalculatedAt: new Date() };
  update.$set = { ...(update.$set || {}), ...snapshot };
  this.setUpdate(update);
 }
});
module.exports={User:mongoose.model('User',userSchema),Booking:mongoose.model('Booking',bookingSchema)};
