const mongoose = require('mongoose');
const familyProfileSchema=new mongoose.Schema({name:{type:String,required:true,trim:true,maxlength:80},relation:{type:String,required:true,trim:true,maxlength:40},phone:{type:String,trim:true,maxlength:20},age:{type:Number,min:0,max:120},notes:{type:String,trim:true,maxlength:300}},{_id:true});
const hospitalSchema=new mongoose.Schema({name:{type:String,required:true,trim:true,maxlength:160},city:{type:String,required:true,trim:true,lowercase:true,maxlength:80},address:{type:String,trim:true,maxlength:300}},{_id:true});
const userSchema = new mongoose.Schema({
 name:{type:String,required:true,trim:true}, phone:{type:String,required:true,unique:true,trim:true}, password:{type:String,required:true},
 role:{type:String,enum:['patient','helper','admin'],default:'patient'}, city:{type:String,trim:true,lowercase:true},
 verified:{type:Boolean,default:false}, available:{type:Boolean,default:true}, leaveDates:{type:[String],default:[]}, upiId:{type:String,trim:true},
 isSuspended:{type:Boolean,default:false}, suspensionReason:{type:String,default:''}, suspendedAt:Date, suspendedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}, ratingAverage:{type:Number,default:0,min:0,max:5}, ratingCount:{type:Number,default:0,min:0}, matchingLocation:{latitude:Number,longitude:Number,consentedAt:Date},
 aadhaarUploaded:{type:Boolean,default:false}, aadhaarAt:Date, aadhaarPublicId:{type:String,select:false}, aadhaarFormat:{type:String,select:false}, expoPushTokens:{type:[String],default:[]},
 favoriteHelpers:{type:[{type:mongoose.Schema.Types.ObjectId,ref:'User'}],default:[]},
 familyProfiles:{type:[familyProfileSchema],default:[]}, savedHospitals:{type:[hospitalSchema],default:[]}, language:{type:String,enum:['en','hi'],default:'en'}
},{timestamps:true});
const chatMessageSchema=new mongoose.Schema({sender:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},text:{type:String,required:true,trim:true,maxlength:2000},createdAt:{type:Date,default:Date.now}});
const locationSchema=new mongoose.Schema({latitude:{type:Number,min:-90,max:90},longitude:{type:Number,min:-180,max:180},accuracy:Number,heading:Number,speed:Number,updatedAt:Date},{_id:false});
const emergencyRequestSchema=new mongoose.Schema({patient:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},patientName:{type:String,required:true,trim:true},contactPhone:{type:String,required:true,trim:true},hospital:{type:String,required:true,trim:true},city:{type:String,required:true,trim:true,lowercase:true},details:{type:String,required:true,trim:true,maxlength:1000},status:{type:String,enum:['pending','acknowledged','closed'],default:'pending'},createdAt:{type:Date,default:Date.now},updatedAt:Date},{timestamps:true});
const refundSchema=new mongoose.Schema({refundId:{type:String,required:true},amount:{type:Number,required:true,min:0.01},status:{type:String,enum:['PENDING','SUCCESS','FAILED'],default:'PENDING'},reason:{type:String,default:''},cashfreeStatus:String,createdAt:{type:Date,default:Date.now},updatedAt:Date},{_id:false});
const bookingSchema=new mongoose.Schema({
 patient:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},helper:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
 patientProfile:{name:String,relation:String,phone:String,age:Number,notes:String}, emergencyRequest:{type:Boolean,default:false},
 service:{type:String,required:true,enum:['queue','report','accompany','medicine','admission','insurance','other']},
 hospital:{type:String,required:true,trim:true},city:{type:String,required:true,trim:true,lowercase:true},details:{type:String,default:''},
 startTime:{type:Date,required:true},endTime:{type:Date,required:true},hours:Number,amount:Number,
 status:{type:String,enum:['awaiting_payment','pending','accepted','on_the_way','ongoing','completed','cancelled'],default:'pending'},
 statusHistory:{type:[{event:{type:String,required:true},status:String,actor:{type:mongoose.Schema.Types.ObjectId,ref:'User'},actorRole:String,at:{type:Date,default:Date.now}}],default:[]}, onTheWayAt:Date, reviewSubmittedAt:Date,
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
bookingSchema.pre('findOneAndUpdate', async function () {
 const update = this.getUpdate() || {};
 const status = update.status || update.$set?.status;
 const currentCommission = update.commissionBps ?? update.$set?.commissionBps;
 const raw = process.env.PLATFORM_COMMISSION_BPS;
 const bps = Number(raw);
 if (status === 'completed' && currentCommission == null && raw !== undefined && raw !== '' && Number.isInteger(bps) && bps >= 0 && bps <= 10000) {
  // Query updates often omit `amount`; read the persisted booking so the
  // completion snapshot uses the real booking value instead of silently 0.
  const current = await this.model.findOne(this.getQuery()).select('amount').lean();
  const amount = Number(update.amount ?? update.$set?.amount ?? current?.amount ?? 0);
  const fee = Math.round((amount * bps / 10000 + Number.EPSILON) * 100) / 100;
  const snapshot = { commissionBps: bps, platformFee: fee, helperNetAmount: Math.max(0, Math.round((amount - fee + Number.EPSILON) * 100) / 100), financialsCalculatedAt: new Date() };
  update.$set = { ...(update.$set || {}), ...snapshot };
  this.setUpdate(update);
 }
});
const reviewSchema=new mongoose.Schema({booking:{type:mongoose.Schema.Types.ObjectId,ref:'Booking',required:true,unique:true},patient:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},helper:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},rating:{type:Number,required:true,min:1,max:5},comment:{type:String,default:'',maxlength:1000}},{timestamps:true});
const incidentSchema=new mongoose.Schema({reporter:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},booking:{type:mongoose.Schema.Types.ObjectId,ref:'Booking'},category:{type:String,required:true},description:{type:String,required:true,select:false,maxlength:2000},status:{type:String,enum:['open','investigating','resolved','dismissed'],default:'open'},resolutionNote:{type:String,default:''},resolvedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},resolvedAt:Date},{timestamps:true});
const payoutSchema=new mongoose.Schema({helper:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},amount:{type:Number,required:true,min:0.01},status:{type:String,enum:['pending','paid','failed'],default:'pending'},reference:{type:String,default:''},statusChangedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},statusHistory:{type:[{status:String,actor:{type:mongoose.Schema.Types.ObjectId,ref:'User'},at:{type:Date,default:Date.now}}],default:[]},paidAt:Date},{timestamps:true});
const auditSchema=new mongoose.Schema({actor:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},action:{type:String,required:true},resource:{type:String,required:true},outcome:{type:String,required:true},ip:String,at:{type:Date,default:Date.now}},{timestamps:true});
module.exports={User:mongoose.model('User',userSchema),Booking:mongoose.model('Booking',bookingSchema),EmergencyRequest:mongoose.model('EmergencyRequest',emergencyRequestSchema),Review:mongoose.model('Review',reviewSchema),IncidentReport:mongoose.model('IncidentReport',incidentSchema),Payout:mongoose.model('Payout',payoutSchema),AuditLog:mongoose.model('AuditLog',auditSchema)};
