const mongoose = require('mongoose');
const { User, Booking, Review, IncidentReport, Payout, AuditLog } = require('./models');
const { financialBreakdown } = require('./phase4');

const safe = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(e => res.status(400).json({error:e.message}));
const clean = (v, n) => String(v ?? '').trim().slice(0, n);
const money = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const validCoords = (lat, lon) => Number.isFinite(Number(lat)) && Number(lat) >= -90 && Number(lat) <= 90 && Number.isFinite(Number(lon)) && Number(lon) >= -180 && Number(lon) <= 180;
const distanceKm = (a, b) => {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const x = Math.sin(dLat/2)**2 + Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
};

function mountPhase6Routes(app, auth) {
  // Audit metadata only: never persist request bodies, identity documents, medical notes or tokens.
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.locals.phase6Response = null;
    res.json = body => { res.locals.phase6Response = body; return originalJson(body); };
    res.on('finish', async () => {
      if (res.statusCode >= 400) return;
      try {
        const actor = req.user;
        const path = req.path;
        let bookingId = path.match(/^\/api\/bookings\/([a-f0-9]{24})\//i)?.[1];
        const body = res.locals.phase6Response;
        let event = null;
        if (path === '/api/bookings/create-payment' && body?.bookingId) { bookingId = String(body.bookingId); event = 'booking_requested'; }
        else if (path === '/api/payments/verify' || path === '/api/payments/cashfree/webhook') {
          const orderId = req.body?.orderId || req.body?.data?.order?.order_id || req.body?.data?.payment?.order_id;
          if (orderId) {
            const b = await Booking.findOne({ cashfreeOrderId: orderId }).select('_id paymentStatus status helper');
            if (b && b.paymentStatus === 'paid') { bookingId = String(b._id); event = 'payment_confirmed'; if (b.helper) res.locals.phase6AssignedHelper = String(b.helper); }
            else if (b && b.paymentStatus === 'failed') { bookingId = String(b._id); event = 'payment_failed'; }
          }
        } else if (path.endsWith('/accept')) event = 'associate_assigned';
        else if (path.endsWith('/on-the-way')) event = 'associate_on_the_way';
        else if (path.endsWith('/start')) event = 'duty_started';
        else if (path.endsWith('/end')) event = 'duty_completed';
        else if (path.endsWith('/cancel')) event = 'booking_cancelled';
        else if (path.endsWith('/review')) event = 'review_submitted';
        if (bookingId && event) {
          const b = await Booking.findById(bookingId).select('status statusHistory');
          if (b) {
            const last = b.statusHistory?.[b.statusHistory.length - 1];
            if (!b.statusHistory?.some(item => item.event === event)) {
              b.statusHistory.push({ event, status: b.status, actor: actor?._id, actorRole: actor?.role || 'system', at: new Date() });
              await b.save();
            }
            if (event === 'payment_confirmed' && res.locals.phase6AssignedHelper && !b.statusHistory?.some(item => item.event === 'associate_assigned')) {
              b.statusHistory.push({ event:'associate_assigned', status:b.status, actor:undefined, actorRole:'system', at:new Date() });
              await b.save();
            }
          }
        }
        if (actor?.role === 'admin' && (['POST','PUT','PATCH','DELETE'].includes(req.method) || (req.method === 'GET' && path.endsWith('/aadhaar'))) && path.startsWith('/api/admin/')) {
          await AuditLog.create({ actor: actor._id, action: req.method, resource: path.replace(/[a-f0-9]{24}/gi, ':id'), outcome: 'success', ip: clean(req.ip, 80), at: new Date() });
        }
      } catch (e) { /* audit must not break the user request; alert through server logging */ console.error('Phase 6 audit write failed:', e.message); }
    });
    next();
  });

  // Consent-based approximate home/service-area coordinates for matching, not live tracking.
  app.put('/api/me/matching-location', auth('helper'), safe(async (req,res) => {
    if (!validCoords(req.body.latitude, req.body.longitude) || req.body.consent !== true) return res.status(400).json({error:'Valid coordinates and explicit consent are required'});
    req.user.matchingLocation = { latitude:Number(req.body.latitude), longitude:Number(req.body.longitude), consentedAt:new Date() };
    await req.user.save();
    res.json({saved:true});
  }));
  app.delete('/api/me/matching-location', auth('helper'), safe(async (req,res) => {
    req.user.matchingLocation = undefined;
    await req.user.save();
    res.json({removed:true});
  }));

  app.get('/api/matching/associates', auth('patient'), safe(async (req,res) => {
    const city = clean(req.query.city,80).toLowerCase();
    const start = new Date(req.query.startTime), end = new Date(req.query.endTime);
    if (!city || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end-start > 240*3600000) return res.status(400).json({error:'Valid city, startTime and endTime are required'});
    const days=[]; const day=new Date(start); day.setHours(0,0,0,0);
    while(day<end && days.length<11){days.push(day.toISOString().slice(0,10));day.setDate(day.getDate()+1);}
    const candidates=await User.find({role:'helper',verified:true,isSuspended:{$ne:true},available:{$ne:false},city,leaveDates:{$nin:days}}).select('name city ratingAverage ratingCount matchingLocation');
    const busy=await Booking.find({helper:{$in:candidates.map(x=>x._id)},status:{$in:['accepted','on_the_way','ongoing']},startTime:{$lt:end},endTime:{$gt:start}}).distinct('helper');
    const busySet=new Set(busy.map(String));
    const hasHospital=validCoords(req.query.latitude,req.query.longitude);
    const rows=candidates.filter(x=>!busySet.has(String(x._id))).map(x=>{
      const km=hasHospital&&x.matchingLocation?.latitude!=null?distanceKm({latitude:Number(req.query.latitude),longitude:Number(req.query.longitude)},x.matchingLocation):null;
      return {id:x._id,name:x.name,city:x.city,ratingAverage:x.ratingAverage||0,ratingCount:x.ratingCount||0,distanceKm:km,availability:true};
    }).sort((a,b)=>{
      if(a.distanceKm!=null&&b.distanceKm!=null&&a.distanceKm!==b.distanceKm)return a.distanceKm-b.distanceKm;
      return b.ratingAverage-a.ratingAverage || b.ratingCount-a.ratingCount;
    });
    res.json({associates:rows,distance:'straight-line estimate; road distance and travel time are not provided'});
  }));

  app.post('/api/bookings/:id/on-the-way', auth('helper'), safe(async (req,res) => {
    const b=await Booking.findOneAndUpdate({_id:req.params.id,helper:req.user._id,status:'accepted',paymentStatus:'paid'},{$set:{status:'on_the_way',onTheWayAt:new Date()}},{new:true});
    if(!b)return res.status(409).json({error:'Only your confirmed paid booking can be marked on the way'});
    res.json(b);
  }));

  app.post('/api/bookings/:id/review', auth('patient'), safe(async (req,res) => {
    const rating=Number(req.body.rating), comment=clean(req.body.comment,1000);
    if(!Number.isInteger(rating)||rating<1||rating>5)return res.status(400).json({error:'Rating must be between 1 and 5'});
    const booking=await Booking.findOne({_id:req.params.id,patient:req.user._id,status:'completed',paymentStatus:{$in:['paid','refunded']}});
    if(!booking||!booking.helper)return res.status(404).json({error:'Completed booking not found'});
    try {
      const review=await Review.create({booking:booking._id,patient:req.user._id,helper:booking.helper,rating,comment});
      const stats=await Review.aggregate([{$match:{helper:booking.helper}},{$group:{_id:null,avg:{$avg:'$rating'},count:{$sum:1}}}]);
      await User.updateOne({_id:booking.helper},{$set:{ratingAverage:Math.round((stats[0]?.avg||0)*100)/100,ratingCount:stats[0]?.count||0}});
      booking.reviewSubmittedAt=new Date(); await booking.save();
      res.status(201).json(review);
    } catch(e) {
      if(e.code===11000)return res.status(409).json({error:'A review has already been submitted for this booking'});
      throw e;
    }
  }));

  app.post('/api/incidents', auth('patient','helper'), safe(async (req,res) => {
    const category=clean(req.body.category,50), description=clean(req.body.description,2000);
    if(!['safety','harassment','service','payment','privacy','other'].includes(category)||description.length<10)return res.status(400).json({error:'Choose a valid category and provide at least 10 characters'});
    let booking;
    if(req.body.bookingId){
      if(!mongoose.isValidObjectId(req.body.bookingId))return res.status(400).json({error:'Invalid booking'});
      booking=await Booking.findById(req.body.bookingId);
      if(!booking||![String(booking.patient),String(booking.helper)].includes(String(req.user._id)))return res.status(404).json({error:'Booking not found'});
    }
    const incident=await IncidentReport.create({reporter:req.user._id,booking:booking?._id,category,description});
    res.status(201).json({id:incident._id,status:incident.status,createdAt:incident.createdAt});
  }));
  app.get('/api/incidents/mine', auth('patient','helper'), safe(async(req,res)=>{
    res.json(await IncidentReport.find({reporter:req.user._id}).select('-description').sort('-createdAt'));
  }));
  app.get('/api/admin/incidents', auth('admin'), safe(async(req,res)=>{
    res.json(await IncidentReport.find().select('+description').populate('reporter','name role').populate('booking','hospital status').sort('-createdAt'));
  }));
  app.patch('/api/admin/incidents/:id', auth('admin'), safe(async(req,res)=>{
    if(!['investigating','resolved','dismissed'].includes(req.body.status))return res.status(400).json({error:'Invalid incident status'});
    const item=await IncidentReport.findByIdAndUpdate(req.params.id,{$set:{status:req.body.status,resolutionNote:clean(req.body.resolutionNote,1000),resolvedBy:req.user._id,resolvedAt:new Date()}},{new:true});
    if(!item)return res.status(404).json({error:'Incident not found'});
    res.json(item);
  }));

  app.post('/api/admin/helpers/:id/suspension', auth('admin'), safe(async(req,res)=>{
    const suspended=!!req.body.suspended, reason=clean(req.body.reason,500);
    if(suspended&&!reason)return res.status(400).json({error:'A reason is required to suspend an associate'});
    const helper=await User.findOneAndUpdate({_id:req.params.id,role:'helper'},{$set:{isSuspended:suspended,suspensionReason:suspended?reason:'',suspendedAt:suspended?new Date():null,suspendedBy:suspended?req.user._id:null,verified:suspended?false:undefined,available:suspended?false:undefined}},{new:true});
    if(!helper)return res.status(404).json({error:'Care Associate not found'});
    res.json({id:helper._id,isSuspended:helper.isSuspended,verified:helper.verified,available:helper.available});
  }));

  app.get('/api/helper/performance', auth('helper'), safe(async(req,res)=>{
    const reviews=await Review.find({helper:req.user._id}).populate('booking','hospital service actualEnd').select('rating comment createdAt booking').sort('-createdAt').limit(100).lean();
    res.json({
      ratingAverage:Number(req.user.ratingAverage||0),
      ratingCount:Number(req.user.ratingCount||0),
      reviews:reviews.map(item=>({id:item._id,rating:item.rating,comment:item.comment,createdAt:item.createdAt,booking:item.booking?{hospital:item.booking.hospital,service:item.booking.service,completedAt:item.booking.actualEnd}:null})),
    });
  }));
  app.get('/api/helper/payouts', auth('helper'), safe(async(req,res)=>{
    const records=await Payout.find({helper:req.user._id}).sort('-createdAt').limit(100).lean();
    const totals=records.reduce((acc,item)=>{acc[item.status]=(acc[item.status]||0)+Number(item.amount||0);return acc;},{pending:0,paid:0,failed:0});
    res.json({currency:'INR',records,totals:Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,money(value)]))});
  }));
  app.post('/api/admin/helpers/:id/payouts', auth('admin'), safe(async(req,res)=>{
    const helper=await User.findOne({_id:req.params.id,role:'helper'});
    if(!helper)return res.status(404).json({error:'Care Associate not found'});
    const amount=money(Number(req.body.amount)), reference=clean(req.body.reference,120);
    if(req.body.status!==undefined&&!['pending','paid'].includes(req.body.status))return res.status(400).json({error:'Payout status must be pending or paid'});
    if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:'Payout amount must be greater than zero'});
    if(req.body.status==='paid'&&!reference)return res.status(400).json({error:'A bank/UPI transfer reference is required to mark payout paid'});
    const completed=await Booking.find({helper:helper._id,status:'completed',paymentStatus:{$in:['paid','refunded']}});
    const earned=money(completed.reduce((sum,b)=>sum+financialBreakdown(b).associateNet,0));
    const prior=await Payout.find({helper:helper._id,status:{$in:['pending','paid']}});
    const reserved=money(prior.reduce((sum,p)=>sum+p.amount,0));
    if(amount>money(earned-reserved))return res.status(409).json({error:'Payout exceeds unallocated associate earnings',available:money(earned-reserved)});
    const payout=await Payout.create({helper:helper._id,amount,status:req.body.status==='paid'?'paid':'pending',reference,statusChangedBy:req.user._id,statusHistory:[{status:req.body.status==='paid'?'paid':'pending',actor:req.user._id,at:new Date()}],paidAt:req.body.status==='paid'?new Date():undefined});
    res.status(201).json(payout);
  }));
  app.patch('/api/admin/payouts/:id', auth('admin'), safe(async(req,res)=>{
    const payout=await Payout.findById(req.params.id);
    if(!payout)return res.status(404).json({error:'Payout not found'});
    if(payout.status!=='pending')return res.status(409).json({error:'Only pending payouts can be updated'});
    const status=req.body.status, reference=clean(req.body.reference,120);
    if(!['paid','failed'].includes(status))return res.status(400).json({error:'Payout status must be paid or failed'});
    if(status==='paid'&&!reference)return res.status(400).json({error:'A transfer reference is required to confirm payout'});
    payout.status=status;payout.reference=reference;payout.statusChangedBy=req.user._id;payout.statusHistory.push({status,actor:req.user._id,at:new Date()});payout.paidAt=status==='paid'?new Date():undefined;
    await payout.save();res.json(payout);
  }));
  const operationsReport = async (req) => {
    const now = new Date();
    const from = req.query.from ? new Date(req.query.from) : new Date(now.getTime() - 30 * 86400000);
    const to = req.query.to ? new Date(req.query.to) : now;
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from || to - from > 366 * 86400000) {
      throw new Error('Choose a valid report date range of up to 366 days');
    }
    to.setDate(to.getDate() + 1);
    const query = { createdAt: { $gte: from, $lt: to } };
    const city = clean(req.query.city, 80).toLowerCase();
    if (city) query.city = city;
    const bookings = await Booking.find(query).select('city hospital service status paymentStatus amount refunds createdAt').sort('-createdAt').lean();
    const group = (keyFn) => {
      const map = new Map();
      for (const booking of bookings) {
        const key = keyFn(booking) || 'Unknown';
        const row = map.get(key) || { name: key, bookings: 0, paid: 0, grossCollected: 0, refunds: 0 };
        row.bookings += 1;
        if (['paid','refunded'].includes(booking.paymentStatus)) {
          row.paid += 1;
          row.grossCollected += Number(booking.amount || 0);
          row.refunds += (booking.refunds || []).filter(item => item.status === 'SUCCESS').reduce((sum,item)=>sum+Number(item.amount||0),0);
        }
        map.set(key,row);
      }
      return [...map.values()].map(row=>({...row,grossCollected:money(row.grossCollected),refunds:money(row.refunds),netCollected:money(row.grossCollected-row.refunds)})).sort((a,b)=>b.bookings-a.bookings).slice(0,30);
    };
    const statuses = {};
    for (const booking of bookings) statuses[booking.status] = (statuses[booking.status] || 0) + 1;
    const grossCollected = bookings.filter(b=>['paid','refunded'].includes(b.paymentStatus)).reduce((sum,b)=>sum+Number(b.amount||0),0);
    const refunds = bookings.reduce((sum,b)=>sum+(b.refunds||[]).filter(item=>item.status==='SUCCESS').reduce((v,item)=>v+Number(item.amount||0),0),0);
    return {
      range:{from:from.toISOString(),to:new Date(to.getTime()-1).toISOString()},
      summary:{bookings:bookings.length,paidBookings:bookings.filter(b=>['paid','refunded'].includes(b.paymentStatus)).length,grossCollected:money(grossCollected),refunds:money(refunds),netCollected:money(grossCollected-refunds)},
      statuses,
      byCity:group(b=>b.city),
      byHospital:group(b=>b.hospital+' • '+b.city),
      byService:group(b=>b.service),
      rows:bookings,
    };
  };
  app.get('/api/admin/reports/operations', auth('admin'), safe(async(req,res)=>{
    const report=await operationsReport(req);
    const {rows,...summary}=report;
    res.json(summary);
  }));
  app.get('/api/admin/reports/operations.csv', auth('admin'), safe(async(req,res)=>{
    const report=await operationsReport(req);
    const cell=value=>{
      let text=String(value??'');
      if (/^[=+@-]/.test(text)) text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    };
    const lines=[['Created At','City','Hospital','Service','Booking Status','Payment Status','Amount INR'].join(',')];
    for(const item of report.rows) lines.push([item.createdAt?.toISOString?.()||'',item.city,item.hospital,item.service,item.status,item.paymentStatus,Number(item.amount||0).toFixed(2)].map(cell).join(','));
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="care-associate-operations-report.csv"');
    res.setHeader('Cache-Control','private, no-store');
    res.send('\uFEFF'+lines.join('\r\n'));
  }));
  app.get('/api/admin/audit-logs', auth('admin'), safe(async(req,res)=>{
    const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));
    const logs=await AuditLog.find().populate('actor','name phone role').sort('-at').limit(limit);
    res.json(logs);
  }));
  app.get('/api/admin/reconciliation', auth('admin'), safe(async(req,res)=>{
    const bookings=await Booking.find({status:'completed',paymentStatus:{$in:['paid','refunded']}});
    const totals=bookings.reduce((acc,b)=>{const f=financialBreakdown(b);acc.gross+=f.gross;acc.refunded+=f.refunded;acc.platformFee+=f.platformFee;acc.associateNet+=f.associateNet;return acc;},{gross:0,refunded:0,platformFee:0,associateNet:0});
    const payouts=await Payout.find().populate('helper','name phone').sort('-createdAt');
    const sum=key=>money(payouts.filter(p=>p.status===key).reduce((a,p)=>a+p.amount,0));
    res.json({currency:'INR',bookings:bookings.length,totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,money(v)])),payouts:{pending:sum('pending'),paid:sum('paid')},records:payouts});
  }));
}
module.exports={mountPhase6Routes,distanceKm};
