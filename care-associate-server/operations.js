const mongoose = require('mongoose');
const { User, Booking, ServiceCatalog, NotificationPreference, NotificationDelivery } = require('./models');
const { notifyBooking } = require('./notifications');

const safe = fn => (req,res) => Promise.resolve(fn(req,res)).catch(error => res.status(400).json({error:error.message}));
const catalogDefaults = [
  ['queue','Queue & Token Assistance','Non-clinical help with hospital queues and token collection.'],
  ['report','Medical Reports Collection','Collect and deliver reports with patient authorization.'],
  ['accompany','Patient Accompaniment','Accompany a patient through approved hospital visits.'],
  ['medicine','Medicine Assistance','Help collect prescribed medicines from the hospital pharmacy.'],
  ['admission','Admission & Discharge Support','Non-clinical assistance with admission and discharge tasks.'],
  ['insurance','Insurance & Ayushman Assistance','Help organize documents and navigate administrative counters.'],
  ['other','Custom Hospital Task','A custom non-clinical hospital task agreed before booking.'],
];
const checklistKeys = new Set(['arrival_confirmed','identity_confirmed','task_completed','belongings_returned','handover_completed']);
const clean = (v,n) => String(v ?? '').trim().slice(0,n);
const validId = id => mongoose.isValidObjectId(id);
const parseDate = value => { const d=new Date(value); if(!value || !Number.isFinite(d.getTime())) throw new Error('Enter a valid date and time'); return d; };

function mountOperationsRoutes(app,auth) {
  app.get('/api/services',safe(async(req,res)=>{
    const saved=await ServiceCatalog.find({active:true}).sort('sortOrder key').lean();
    res.json({items:saved.length?saved:catalogDefaults.map(([key,title,description],sortOrder)=>({key,title,description,active:true,sortOrder}))});
  }));
  app.get('/api/admin/services',auth('admin'),safe(async(req,res)=>{
    const saved=await ServiceCatalog.find().sort('sortOrder key').lean();
    res.json({items:saved.length?saved:catalogDefaults.map(([key,title,description],sortOrder)=>({key,title,description,active:true,sortOrder}))});
  }));
  app.put('/api/admin/services/:key',auth('admin'),safe(async(req,res)=>{
    const key=clean(req.params.key,30);
    if(!catalogDefaults.some(row=>row[0]===key)) throw new Error('Unknown service key');
    const title=clean(req.body.title,100),description=clean(req.body.description,1000);
    if(!title) throw new Error('Service title is required');
    const item=await ServiceCatalog.findOneAndUpdate({key},{$set:{title,description,active:req.body.active!==false,sortOrder:Math.max(0,Math.min(1000,Number(req.body.sortOrder)||0))}},{upsert:true,new:true,runValidators:true});
    res.json({item});
  }));

  app.get('/api/notification-preferences',auth('patient','helper','admin'),safe(async(req,res)=>{
    const prefs=await NotificationPreference.findOne({user:req.user._id}).lean();
    res.json(prefs||{pushEnabled:true,bookingUpdates:true,chatMessages:true,marketing:false});
  }));
  app.patch('/api/notification-preferences',auth('patient','helper','admin'),safe(async(req,res)=>{
    const allowed=['pushEnabled','bookingUpdates','chatMessages','marketing'],update={};
    for(const key of allowed) if(req.body[key]!==undefined) {
      if(typeof req.body[key]!=='boolean') throw new Error(key+' must be true or false');
      update[key]=req.body[key];
    }
    if(!Object.keys(update).length) throw new Error('No notification preference changes supplied');
    const prefs=await NotificationPreference.findOneAndUpdate({user:req.user._id},{$set:update,$setOnInsert:{user:req.user._id}},{upsert:true,new:true,runValidators:true});
    res.json(prefs);
  }));
  app.get('/api/admin/notification-deliveries',auth('admin'),safe(async(req,res)=>{
    const limit=Math.min(200,Math.max(1,Number(req.query.limit)||50));
    const items=await NotificationDelivery.find().populate('user','name role').sort('-createdAt').limit(limit).lean();
    res.json({items});
  }));

  app.post('/api/bookings/:id/reschedule',auth('patient'),safe(async(req,res)=>{
    if(!validId(req.params.id)) throw new Error('Invalid booking');
    const booking=await Booking.findOne({_id:req.params.id,patient:req.user._id});
    if(!booking) throw new Error('Booking not found');
    if(booking.paymentStatus!=='paid'||!['pending','accepted'].includes(booking.status)) throw new Error('Only paid upcoming bookings can be rescheduled');
    if(booking.startTime.getTime()-Date.now()<24*60*60*1000) throw new Error('Rescheduling within 24 hours requires contacting support');
    if(Number(booking.rescheduleCount||0)>=2) throw new Error('This booking has reached the two-reschedule limit');
    const start=parseDate(req.body.startTime),end=parseDate(req.body.endTime);
    if(start<=new Date()||end<=start||(end-start)>240*60*60*1000) throw new Error('Choose a future time range of up to 240 hours');
    if(start>Date.now()+100*24*60*60*1000) throw new Error('Bookings can be rescheduled up to 100 days ahead');
    if(booking.helper) {
      const helper=await User.findOne({_id:booking.helper,role:'helper',verified:true,isSuspended:{$ne:true},available:{$ne:false}});
      if(!helper) throw new Error('Assigned Care Associate is not currently eligible; contact support');
      const day=new Date(start);day.setHours(0,0,0,0);
      const endDay=new Date(end);endDay.setHours(0,0,0,0);
      for(const d=new Date(day);d<=endDay;d.setDate(d.getDate()+1)) {
        const key=d.toISOString().slice(0,10);
        if((helper.leaveDates||[]).includes(key)) throw new Error('Care Associate has leave on the selected date');
      }
      const clash=await Booking.findOne({_id:{$ne:booking._id},helper:helper._id,status:{$in:['accepted','on_the_way','ongoing']},startTime:{$lt:end},endTime:{$gt:start}});
      if(clash) throw new Error('Care Associate has another booking at the selected time');
    }
    const oldStart=booking.startTime;
    booking.startTime=start;booking.endTime=end;booking.hours=Math.ceil((end-start)/3600000);booking.rescheduleCount=(booking.rescheduleCount||0)+1;
    booking.statusHistory.push({event:'rescheduled',status:booking.status,actor:req.user._id,actorRole:'patient',at:new Date()});
    await booking.save();
    if(booking.helper) await notifyBooking(booking,booking.helper,'Booking rescheduled','A patient rescheduled the booking. Please review the updated schedule.');
    await notifyBooking(booking,booking.patient,'Booking rescheduled','Your booking schedule has been updated.');
    res.json({booking,previousStartTime:oldStart,rescheduleCount:booking.rescheduleCount});
  }));

  app.get('/api/bookings/:id/visit',auth('patient','helper'),safe(async(req,res)=>{
    if(!validId(req.params.id)) throw new Error('Invalid booking');
    const booking=await Booking.findById(req.params.id);
    if(!booking||![String(booking.patient),String(booking.helper)].includes(String(req.user._id))) return res.status(404).json({error:'Booking not found'});
    res.json({bookingId:booking._id,status:booking.status,checklist:booking.visitChecklist||[],handoverNote:booking.handoverNote||'',safetyCheckInAt:booking.safetyCheckInAt,safetyCheckOutAt:booking.safetyCheckOutAt});
  }));
  app.patch('/api/bookings/:id/visit/checklist',auth('helper'),safe(async(req,res)=>{
    if(!validId(req.params.id)) throw new Error('Invalid booking');
    const booking=await Booking.findOne({_id:req.params.id,helper:req.user._id,status:'ongoing'});
    if(!booking) throw new Error('Checklist is available only to the assigned helper during an active duty');
    const key=clean(req.body.key,40);
    if(!checklistKeys.has(key)||typeof req.body.checked!=='boolean') throw new Error('Choose a valid checklist item and checked state');
    const item=booking.visitChecklist.find(x=>x.key===key);
    if(item){item.checked=req.body.checked;item.checkedAt=req.body.checked?new Date():undefined;item.checkedBy=req.user._id;}
    else booking.visitChecklist.push({key,checked:req.body.checked,checkedAt:req.body.checked?new Date():undefined,checkedBy:req.user._id});
    await booking.save();
    res.json({checklist:booking.visitChecklist});
  }));
  app.patch('/api/bookings/:id/visit/handover',auth('helper'),safe(async(req,res)=>{
    if(!validId(req.params.id)) throw new Error('Invalid booking');
    const booking=await Booking.findOne({_id:req.params.id,helper:req.user._id,status:{$in:['ongoing','completed']}});
    if(!booking) throw new Error('Handover is available only to the assigned helper during or after duty');
    booking.handoverNote=clean(req.body.note,1500);
    await booking.save();
    res.json({handoverNote:booking.handoverNote});
  }));
  app.post('/api/bookings/:id/safety-check-in',auth('helper'),safe(async(req,res)=>{
    if(!validId(req.params.id)) throw new Error('Invalid booking');
    const booking=await Booking.findOne({_id:req.params.id,helper:req.user._id,status:'ongoing'});
    if(!booking) throw new Error('Safety check-in is available only during your active duty');
    booking.safetyCheckInAt=new Date();booking.safetyCheckOutAt=undefined;booking.safetyAlertAt=undefined;
    await booking.save();
    res.json({checkedInAt:booking.safetyCheckInAt});
  }));
  app.post('/api/bookings/:id/safety-check-out',auth('helper'),safe(async(req,res)=>{
    if(!validId(req.params.id)) throw new Error('Invalid booking');
    const booking=await Booking.findOne({_id:req.params.id,helper:req.user._id,status:{$in:['ongoing','completed']}});
    if(!booking) throw new Error('Safety check-out is available only for your active or completed duty');
    booking.safetyCheckOutAt=new Date();await booking.save();
    res.json({checkedOutAt:booking.safetyCheckOutAt});
  }));
}
module.exports={mountOperationsRoutes};
