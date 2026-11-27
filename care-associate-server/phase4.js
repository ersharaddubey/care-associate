const PDFDocument=require('pdfkit');
const crypto=require('crypto');
const {Booking,Payout}=require('./models');
const {createCashfreeRefund,fetchCashfreeRefunds}=require('./cashfree');
const money=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const refundedTotal=b=>money((b.refunds||[]).filter(r=>r.status==='SUCCESS').reduce((s,r)=>s+Number(r.amount||0),0));
function commissionBps(){
 const raw=process.env.PLATFORM_COMMISSION_BPS;
 if(raw===undefined||raw==='')throw new Error('Configure PLATFORM_COMMISSION_BPS (basis points) before using earnings reports');
 const n=Number(raw);
 if(!Number.isInteger(n)||n<0||n>10000)throw new Error('PLATFORM_COMMISSION_BPS must be an integer from 0 to 10000');
 return n;
}
function financialBreakdown(b){
 const gross=money(Number(b.amount||0));
 const refunded=Math.min(gross,refundedTotal(b));
 const bps=b.commissionBps==null?commissionBps():Number(b.commissionBps);
 if(!Number.isInteger(bps)||bps<0||bps>10000)throw new Error('Booking commission snapshot is invalid');
 const retained=money(Math.max(0,gross-refunded));
 const platformFee=money(retained*bps/10000);
 return {gross,refunded,platformFee,associateNet:money(Math.max(0,retained-platformFee)),commissionBps:bps};
}
function mountPhase4Routes(app,auth){
 app.get('/api/helper/earnings',auth('helper'),async(req,res)=>{
  try{
   const list=await Booking.find({helper:req.user._id,status:'completed',paymentStatus:{$in:['paid','refunded']}}).sort('-actualEnd');
   let gross=0,fee=0,net=0,refunded=0;
   const bookings=list.map(b=>{
    const f=financialBreakdown(b);gross+=f.gross;fee+=f.platformFee;net+=f.associateNet;refunded+=f.refunded;
    return {bookingId:String(b._id),hospital:b.hospital,service:b.service,completedAt:b.actualEnd||b.endTime,...f};
   });
   res.json({currency:'INR',gross:money(gross),platformFee:money(fee),refunded:money(refunded),associateEarning:money(net),bookings,note:'Calculated earnings only; UPI payout is a separate administrator operation.'});
  }catch(e){res.status(503).json({error:e.message});}
 });

 app.get('/api/helper/payouts/statement.csv',auth('helper'),async(req,res)=>{
  try{
   const rows=await Payout.find({helper:req.user._id}).sort('-createdAt').limit(1000).lean();
   const cell=value=>{
    let text=String(value??'');
    if(/^[=+@\\-\\t\\r]/.test(text))text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
   };
   const lines=[['Payout ID','Created at','Amount INR','Status','Transfer reference','Paid at'].map(cell).join(',')];
   for(const row of rows)lines.push([String(row._id),row.createdAt?.toISOString(),Number(row.amount||0).toFixed(2),row.status,row.reference,row.paidAt?.toISOString()].map(cell).join(','));
   res.setHeader('Content-Type','text/csv; charset=utf-8');
   res.setHeader('Content-Disposition','attachment; filename="care-associate-payout-statement.csv"');
   res.setHeader('Cache-Control','private, no-store');
   res.send('\\uFEFF'+lines.join('\\r\\n'));
  }catch(e){res.status(503).json({error:'Unable to prepare payout statement'});}
 });

 app.get('/api/bookings/:id/invoice',auth('patient','helper','admin'),async(req,res)=>{
  try{
   const b=await Booking.findById(req.params.id).populate('patient','name').populate('helper','name');
   if(!b)return res.status(404).json({error:'Booking not found'});
   const allowed=req.user.role==='admin'||String(b.patient?._id||b.patient)===String(req.user._id)||String(b.helper?._id||b.helper)===String(req.user._id);
   if(!allowed)return res.status(403).json({error:'Not allowed'});
   if(!['paid','refunded'].includes(b.paymentStatus))return res.status(409).json({error:'Invoice is available after payment is confirmed'});
   res.setHeader('Content-Type','application/pdf');
   res.setHeader('Content-Disposition',`attachment; filename="care-associate-invoice-${b._id}.pdf"`);
   res.setHeader('Cache-Control','private, no-store');
   const d=new PDFDocument({size:'A4',margin:52});d.pipe(res);
   d.fontSize(22).fillColor('#0f766e').text('Care Associate');d.moveDown().fontSize(16).fillColor('#111827').text('Booking payment record');
   d.moveDown().fontSize(10).text('Booking ID: '+b._id).text('Cashfree order: '+(b.cashfreeOrderId||'—')).text('Payment date: '+(b.paymentAt?new Date(b.paymentAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'—'));
   d.moveDown().fontSize(12).text('Patient: '+(b.patient?.name||'—')).fontSize(10).text('Hospital: '+b.hospital).text('City: '+b.city).text('Service: '+b.service).text('Care Associate: '+(b.helper?.name||'Not assigned'));
   d.moveDown().fontSize(13).text('Payment summary').fontSize(11).text('Booking amount: INR '+money(b.amount).toFixed(2)).text('Payment status: '+b.paymentStatus.toUpperCase()).text('Successful refunds: INR '+refundedTotal(b).toFixed(2)).text('Net retained: INR '+money(Number(b.amount)-refundedTotal(b)).toFixed(2));
   d.moveDown().fontSize(9).fillColor('#6b7280').text('Computer-generated payment record. This is not a GST tax invoice. Care Associate provides non-medical assistance services.');d.end();
  }catch(e){if(!res.headersSent)res.status(400).json({error:e.message});}
 });
 app.get('/api/admin/finance',auth('admin'),async(req,res)=>{
  try{
   const list=await Booking.find({paymentStatus:{$in:['paid','refunded']}}).populate('patient','name phone').populate('helper','name phone upiId').sort('-paymentAt');
   res.json({currency:'INR',bookings:list.map(b=>({bookingId:String(b._id),patient:b.patient,helper:b.helper,status:b.status,paymentStatus:b.paymentStatus,...financialBreakdown(b),refunds:b.refunds||[]}))});
  }catch(e){res.status(503).json({error:e.message});}
 });
 app.post('/api/admin/bookings/:id/refunds',auth('admin'),async(req,res)=>{
  try{
   const b=await Booking.findById(req.params.id);
   if(!b||!b.cashfreeOrderId)return res.status(404).json({error:'Paid Cashfree booking not found'});
   if(b.paymentStatus!=='paid')return res.status(409).json({error:'Only paid bookings can be refunded'});
   const amount=money(Number(req.body.amount));
   if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:'Refund amount must be greater than zero'});
   const reserved=money((b.refunds||[]).filter(r=>r.status!=='FAILED').reduce((s,r)=>s+Number(r.amount||0),0));
   if(amount>money(Number(b.amount)-reserved))return res.status(400).json({error:'Refund exceeds remaining captured amount'});
   const reason=String(req.body.reason||'').trim().slice(0,200),refundId='car_'+crypto.randomBytes(10).toString('hex');
   const remote=await createCashfreeRefund({orderId:b.cashfreeOrderId,refundId,amount,reason});
   b.refunds.push({refundId,amount,reason,status:'PENDING',cashfreeStatus:remote.refund_status||'PENDING'});
   await b.save();res.status(202).json({refundId,amount,status:'PENDING',cashfree:remote});
  }catch(e){res.status(400).json({error:e.message});}
 });
 app.post('/api/admin/bookings/:id/refunds/:refundId/sync',auth('admin'),async(req,res)=>{
  try{
   const b=await Booking.findById(req.params.id),refund=b?.refunds?.find(r=>r.refundId===req.params.refundId);
   if(!refund)return res.status(404).json({error:'Refund not found'});
   const data=await fetchCashfreeRefunds(b.cashfreeOrderId),rows=Array.isArray(data)?data:(data.refunds||[]);
   const remote=rows.find(r=>r.refund_id===refund.refundId);
   if(!remote)return res.status(404).json({error:'Refund status not available yet'});
   const status=String(remote.refund_status||'').toUpperCase();refund.cashfreeStatus=status;
   refund.status=status==='SUCCESS'?'SUCCESS':status==='FAILED'?'FAILED':'PENDING';refund.updatedAt=new Date();
   const total=refundedTotal(b);if(total>=Number(b.amount))b.paymentStatus='refunded';
   await b.save();res.json({refundId:refund.refundId,status:refund.status,paymentStatus:b.paymentStatus,refunded:total});
  }catch(e){res.status(400).json({error:e.message});}
 });
}
module.exports={mountPhase4Routes,commissionBps,refundedTotal,financialBreakdown};
