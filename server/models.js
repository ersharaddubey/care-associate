const mongoose = require('mongoose');
const familyProfileSchema=new mongoose.Schema({name:{type:String,required:true,trim:true,maxlength:80},relation:{type:String,required:true,trim:true,maxlength:40},phone:{type:String,trim:true,maxlength:20},age:{type:Number,min:0,max:120},notes:{type:String,trim:true,maxlength:300}},{_id:true});
const hospitalSchema=new mongoose.Schema({name:{type:String,required:true,trim:true,maxlength:160},city:{type:String,required:true,trim:true,lowercase:true,maxlength:80},address:{type:String,trim:true,maxlength:300}},{_id:true});
const userSchema = new mongoose.Schema({
 name:{type:String,required:true,trim:true}, phone:{type:String,required:true,unique:true,trim:true}, email:{type:String,trim:true,lowercase:true,unique:true,sparse:true}, emailVerified:{type:Boolean,default:false}, password:{type:String,required:false},
 role:{type:String,enum:['patient','helper','admin'],default:'patient'}, adminPermissions:{type:[String],default:undefined}, city:{type:String,trim:true,lowercase:true},
 verified:{type:Boolean,default:false}, available:{type:Boolean,default:true}, leaveDates:{type:[String],default:[]}, upiId:{type:String,trim:true},
 isSuspended:{type:Boolean,default:false}, suspensionReason:{type:String,default:''}, suspendedAt:Date, suspendedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}, ratingAverage:{type:Number,default:0,min:0,max:5}, ratingCount:{type:Number,default:0,min:0}, matchingLocation:{latitude:Number,longitude:Number,consentedAt:Date},
 aadhaarUploaded:{type:Boolean,default:false}, aadhaarAt:Date, aadhaarPublicId:{type:String,select:false}, aadhaarFormat:{type:String,select:false}, expoPushTokens:{type:[String],default:[]},
 favoriteHelpers:{type:[{type:mongoose.Schema.Types.ObjectId,ref:'User'}],default:[]},
 familyProfiles:{type:[familyProfileSchema],default:[]}, savedHospitals:{type:[hospitalSchema],default:[]}, trainingProgress:{type:[{moduleId:String,score:Number,passed:Boolean,completedAt:Date,attempts:Number,lastAttemptAt:Date}],default:[]}, language:{type:String,enum:['en','hi'],default:'en'}, referralCode:{type:String,unique:true,sparse:true,index:true}, permanentCouponCode:{type:String,unique:true,sparse:true,index:true}, referralRewardBalance:{type:Number,default:0,min:0}, couponCommissionBalance:{type:Number,default:0,min:0}, pendingCouponCommissions:{type:[{booking:{type:mongoose.Schema.Types.ObjectId,ref:'Booking'},amount:{type:Number,min:0},availableAt:Date,paidAt:Date}],default:[]}
},{timestamps:true});
const chatMessageSchema=new mongoose.Schema({sender:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},text:{type:String,required:true,trim:true,maxlength:2000},createdAt:{type:Date,default:Date.now}});
const locationSchema=new mongoose.Schema({latitude:{type:Number,min:-90,max:90},longitude:{type:Number,min:-180,max:180},accuracy:Number,heading:Number,speed:Number,updatedAt:Date},{_id:false});
const emergencyRequestSchema=new mongoose.Schema({patient:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},patientName:{type:String,required:true,trim:true},contactPhone:{type:String,required:true,trim:true},hospital:{type:String,required:true,trim:true},city:{type:String,required:true,trim:true,lowercase:true},details:{type:String,required:true,trim:true,maxlength:1000},status:{type:String,enum:['pending','acknowledged','closed'],default:'pending'},createdAt:{type:Date,default:Date.now},updatedAt:Date},{timestamps:true});
const refundSchema=new mongoose.Schema({refundId:{type:String,required:true},amount:{type:Number,required:true,min:0.01},status:{type:String,enum:['PENDING','SUCCESS','FAILED'],default:'PENDING'},reason:{type:String,default:''},cashfreeStatus:String,createdAt:{type:Date,default:Date.now},updatedAt:Date},{_id:false});
const bookingSchema=new mongoose.Schema({
 patient:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},helper:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
 patientProfile:{name:String,relation:String,phone:String,age:Number,notes:String}, familyConsentAt:Date, emergencyRequest:{type:Boolean,default:false},
 service:{type:String,required:true,enum:['queue','report','accompany','medicine','admission','insurance','other']}, bookingType:{type:String,enum:['hourly','token'],default:'hourly'}, baseAmount:{type:Number,min:0}, discountAmount:{type:Number,min:0,default:0}, donationCouponUses:{type:[{coupon:{type:mongoose.Schema.Types.ObjectId,ref:'DonationCoupon'},amount:{type:Number,min:0},hours:{type:Number,min:0},status:{type:String,enum:['reserved','used','released'],default:'reserved'}}],default:[]}, personalCouponOwner:{type:mongoose.Schema.Types.ObjectId,ref:'User'}, personalCouponCode:{type:String,default:''}, personalCouponHours:{type:Number,min:0,default:0}, personalCouponDiscount:{type:Number,min:0,default:0}, personalCouponCommission:{type:Number,min:0,default:0}, referralRewardUsed:{type:Number,min:0,default:0}, referralRewardReserved:{type:Boolean,default:false}, rewardsProcessedAt:Date,
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
 liveLocation:{type:locationSchema,default:undefined},etaMinutes:{type:Number,min:1,max:600},etaUpdatedAt:Date,
 rescheduleCount:{type:Number,default:0,min:0,max:2},
 visitChecklist:{type:[{key:String,checked:Boolean,checkedAt:Date,checkedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}}],default:[]},
 handoverNote:{type:String,default:'',maxlength:1500}, safetyCheckInAt:Date,safetyCheckOutAt:Date,safetyAlertAt:Date
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


const privateDocumentSchema = new mongoose.Schema({
 owner:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
 role:{type:String,enum:['patient','helper'],required:true},
 category:{type:String,enum:['medical_report','prescription','insurance','identity','certificate','other'],required:true},
 title:{type:String,required:true,trim:true,maxlength:100},
 publicId:{type:String,required:true,select:false},
 format:{type:String,required:true,enum:['jpg','png']},
 mimeType:{type:String,required:true,enum:['image/jpeg','image/png']},
 sizeBytes:{type:Number,required:true,min:1,max:5*1024*1024},
 expiryAt:Date,
 reviewStatus:{type:String,enum:['not_required','pending','approved','rejected'],default:'not_required'},
 reviewNote:{type:String,default:'',maxlength:500},
 reviewedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
 reviewedAt:Date
},{timestamps:true});
privateDocumentSchema.index({owner:1,createdAt:-1});

const supportMessageSchema = new mongoose.Schema({
 sender:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 senderRole:{type:String,enum:['patient','helper','admin'],required:true},
 body:{type:String,required:true,trim:true,maxlength:3000},
 createdAt:{type:Date,default:Date.now}
},{_id:true});
const supportTicketSchema = new mongoose.Schema({
 owner:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
 role:{type:String,enum:['patient','helper'],required:true},
 subject:{type:String,required:true,trim:true,maxlength:120},
 category:{type:String,enum:['booking','payment','account','associate','safety','other'],required:true},
 status:{type:String,enum:['open','in_progress','resolved','closed'],default:'open',index:true},
 messages:{type:[supportMessageSchema],default:[]}
},{timestamps:true});
supportTicketSchema.index({owner:1,updatedAt:-1});

const notificationPreferenceSchema=new mongoose.Schema({user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,unique:true,index:true},pushEnabled:{type:Boolean,default:true},bookingUpdates:{type:Boolean,default:true},chatMessages:{type:Boolean,default:true},marketing:{type:Boolean,default:false}},{timestamps:true});
const notificationDeliverySchema=new mongoose.Schema({user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},kind:{type:String,required:true},status:{type:String,enum:['sent','failed','skipped'],required:true},providerStatus:String,errorCode:String,createdAt:{type:Date,default:Date.now}},{timestamps:false});
notificationDeliverySchema.index({createdAt:1},{expireAfterSeconds:7776000});
const clientDiagnosticSchema=new mongoose.Schema({user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},role:{type:String,enum:['patient','helper','admin'],required:true},platform:{type:String,default:'unknown',maxlength:20},appVersion:{type:String,default:'',maxlength:40},message:{type:String,required:true,maxlength:500},stack:{type:String,default:'',maxlength:4000},componentStack:{type:String,default:'',maxlength:4000},createdAt:{type:Date,default:Date.now}},{timestamps:false});
clientDiagnosticSchema.index({createdAt:1},{expireAfterSeconds:7776000});
const referralSchema=new mongoose.Schema({referrer:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},referredUser:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,unique:true},code:{type:String,required:true,trim:true,uppercase:true},status:{type:String,enum:['pending','qualified','rejected'],default:'pending'},rewardAmount:{type:Number,default:0,min:0},payoutStatus:{type:String,enum:['not_eligible','pending','paid'],default:'not_eligible'},note:{type:String,default:'',maxlength:500},reviewedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},reviewedAt:Date,paidAt:Date},{timestamps:true});
const donationCouponSchema=new mongoose.Schema({
 donor:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
 source:{type:String,enum:['referral_reward','coupon_commission'],required:true},
 originalAmount:{type:Number,required:true,min:1},
 remainingAmount:{type:Number,required:true,min:0},
 code:{type:String,required:true,unique:true,index:true},
 active:{type:Boolean,default:true},
 redemptions:{type:[{patient:{type:mongoose.Schema.Types.ObjectId,ref:'User'},booking:{type:mongoose.Schema.Types.ObjectId,ref:'Booking'},amount:{type:Number,min:0},hours:{type:Number,min:0},status:{type:String,enum:['reserved','used','released'],default:'reserved'},usedAt:{type:Date,default:Date.now}}],default:[]}
},{timestamps:true});
const rewardWithdrawalSchema=new mongoose.Schema({
 user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
 amount:{type:Number,required:true,min:1},
 status:{type:String,enum:['pending','paid','rejected'],default:'pending',index:true},
 reference:{type:String,default:''},
 reviewedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
 reviewedAt:Date,
 paidAt:Date
},{timestamps:true});
const emailOtpSchema=new mongoose.Schema({email:{type:String,required:true,lowercase:true,trim:true,index:true},purpose:{type:String,required:true,enum:['login','register']},codeHash:{type:String,required:true},attempts:{type:Number,default:0},expiresAt:{type:Date,required:true},consumedAt:Date,createdAt:{type:Date,default:Date.now}},{timestamps:false});
emailOtpSchema.index({expiresAt:1},{expireAfterSeconds:0});
emailOtpSchema.index({email:1,purpose:1,createdAt:-1});
const rateLimitCounterSchema=new mongoose.Schema({key:{type:String,required:true,unique:true},count:{type:Number,default:0},expiresAt:{type:Date,required:true}},{timestamps:false});
rateLimitCounterSchema.index({expiresAt:1},{expireAfterSeconds:0});
const serviceCatalogSchema=new mongoose.Schema({key:{type:String,required:true,unique:true,enum:['queue','report','accompany','medicine','admission','insurance','other']},title:{type:String,required:true,trim:true,maxlength:100},description:{type:String,default:'',maxlength:1000},active:{type:Boolean,default:true},sortOrder:{type:Number,default:0,min:0,max:1000}},{timestamps:true});
const notificationSchema=new mongoose.Schema({
 recipient:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
 title:{type:String,required:true,trim:true,maxlength:120},
 body:{type:String,required:true,trim:true,maxlength:500},
 data:{type:mongoose.Schema.Types.Mixed,default:{}},
 readAt:Date
},{timestamps:true});
notificationSchema.index({createdAt:1},{expireAfterSeconds:7776000});
module.exports={User:mongoose.model('User',userSchema),Booking:mongoose.model('Booking',bookingSchema),EmergencyRequest:mongoose.model('EmergencyRequest',emergencyRequestSchema),Review:mongoose.model('Review',reviewSchema),IncidentReport:mongoose.model('IncidentReport',incidentSchema),Payout:mongoose.model('Payout',payoutSchema),AuditLog:mongoose.model('AuditLog',auditSchema),Notification:mongoose.model('Notification',notificationSchema),SupportTicket:mongoose.model('SupportTicket',supportTicketSchema),PrivateDocument:mongoose.model('PrivateDocument',privateDocumentSchema),NotificationPreference:mongoose.model('NotificationPreference',notificationPreferenceSchema),NotificationDelivery:mongoose.model('NotificationDelivery',notificationDeliverySchema),ServiceCatalog:mongoose.model('ServiceCatalog',serviceCatalogSchema),RateLimitCounter:mongoose.model('RateLimitCounter',rateLimitCounterSchema),EmailOtp:mongoose.model('EmailOtp',emailOtpSchema),Referral:mongoose.model('Referral',referralSchema),DonationCoupon:mongoose.model('DonationCoupon',donationCouponSchema),RewardWithdrawal:mongoose.model('RewardWithdrawal',rewardWithdrawalSchema),ClientDiagnostic:mongoose.model('ClientDiagnostic',clientDiagnosticSchema)};
