const mongoose=require('mongoose');
const {User,EmergencyRequest}=require('./models');
const {sendPushToUser}=require('./notifications');
const clean=(v,max)=>String(v??'').trim().slice(0,max);
const validPhone=v=>/^[+0-9 ()-]{7,20}$/.test(v);
function mountPhase5Routes(app,auth){
 app.get('/api/patient/experience',auth('patient'),async(req,res)=>{
  const favourites=await User.find({_id:{$in:req.user.favoriteHelpers||[]},role:'helper',verified:true}).select('name city available');
  res.json({familyProfiles:req.user.familyProfiles||[],savedHospitals:req.user.savedHospitals||[],favourites,language:req.user.language||'en'});
 });
 app.post('/api/patient/favourites/:helperId',auth('patient'),async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.helperId))return res.status(400).json({error:'Invalid Care Associate'});
  const helper=await User.findOne({_id:req.params.helperId,role:'helper',verified:true});
  if(!helper)return res.status(404).json({error:'Verified Care Associate not found'});
  const exists=(req.user.favoriteHelpers||[]).some(id=>String(id)===String(helper._id));
  await User.updateOne({_id:req.user._id},exists?{$pull:{favoriteHelpers:helper._id}}:{$addToSet:{favoriteHelpers:helper._id}});
  res.json({favourite:!exists});
 });
 app.post('/api/patient/family',auth('patient'),async(req,res)=>{
  const name=clean(req.body.name,80),relation=clean(req.body.relation,40),phone=clean(req.body.phone,20),notes=clean(req.body.notes,300),age=req.body.age===''||req.body.age==null?undefined:Number(req.body.age);
  if(!name||!relation)return res.status(400).json({error:'Name and relationship are required'});
  if(phone&&!validPhone(phone))return res.status(400).json({error:'Enter a valid contact number'});
  if(age!==undefined&&(!Number.isInteger(age)||age<0||age>120))return res.status(400).json({error:'Enter a valid age'});
  req.user.familyProfiles.push({name,relation,phone,notes,age});await req.user.save();
  res.status(201).json(req.user.familyProfiles);
 });
 app.patch('/api/patient/family/:id',auth('patient'),async(req,res)=>{
  const p=req.user.familyProfiles.id(req.params.id);if(!p)return res.status(404).json({error:'Family profile not found'});
  for(const key of ['name','relation','phone','notes'])if(req.body[key]!==undefined)p[key]=clean(req.body[key],key==='notes'?300:key==='name'?80:key==='relation'?40:20);
  if(req.body.age!==undefined){const age=Number(req.body.age);if(!Number.isInteger(age)||age<0||age>120)return res.status(400).json({error:'Enter a valid age'});p.age=age;}
  if(!p.name||!p.relation||(p.phone&&!validPhone(p.phone)))return res.status(400).json({error:'Please check family profile details'});
  await req.user.save();res.json(req.user.familyProfiles);
 });
 app.delete('/api/patient/family/:id',auth('patient'),async(req,res)=>{
  const p=req.user.familyProfiles.id(req.params.id);if(!p)return res.status(404).json({error:'Family profile not found'});
  p.deleteOne();await req.user.save();res.json(req.user.familyProfiles);
 });
 app.post('/api/patient/hospitals',auth('patient'),async(req,res)=>{
  const name=clean(req.body.name,160),city=clean(req.body.city,80).toLowerCase(),address=clean(req.body.address,300);
  if(!name||!city)return res.status(400).json({error:'Hospital name and city are required'});
  if((req.user.savedHospitals||[]).some(h=>h.name.toLowerCase()===name.toLowerCase()&&h.city===city))return res.status(409).json({error:'This hospital is already saved'});
  req.user.savedHospitals.push({name,city,address});await req.user.save();res.status(201).json(req.user.savedHospitals);
 });
 app.delete('/api/patient/hospitals/:id',auth('patient'),async(req,res)=>{
  const h=req.user.savedHospitals.id(req.params.id);if(!h)return res.status(404).json({error:'Saved hospital not found'});
  h.deleteOne();await req.user.save();res.json(req.user.savedHospitals);
 });
 app.put('/api/me/language',auth('patient','helper'),async(req,res)=>{
  if(!['en','hi'].includes(req.body.language))return res.status(400).json({error:'Language must be en or hi'});
  req.user.language=req.body.language;await req.user.save();res.json({language:req.user.language});
 });
 app.post('/api/emergency/request',auth('patient'),async(req,res)=>{
  const patientName=clean(req.body.patientName,80),contactPhone=clean(req.body.contactPhone,20),hospital=clean(req.body.hospital,160),city=clean(req.body.city,80),details=clean(req.body.details,1000);
  if(!patientName||!validPhone(contactPhone)||!hospital||!city||!details)return res.status(400).json({error:'Please complete patient, contact, hospital, city and assistance details'});
  const request=await EmergencyRequest.create({patient:req.user._id,patientName,contactPhone,hospital,city,details});
  const admins=await User.find({role:'admin'}).select('_id');
  await Promise.all(admins.map(a=>sendPushToUser(a._id,'Emergency assistance request',`${patientName} needs assistance at ${hospital}, ${city}`,{emergencyRequestId:String(request._id),screen:'admin-emergency'}).catch(()=>{})));
  res.status(201).json({request,notice:'This sends a request to Care Associate administrators; it is not an emergency dispatch service. For immediate danger or medical emergency in India, call 112.'});
 });
 app.get('/api/emergency/mine',auth('patient'),async(req,res)=>{
  res.json(await EmergencyRequest.find({patient:req.user._id}).sort('-createdAt'));
 });
 app.get('/api/admin/emergency',auth('admin'),async(req,res)=>{
  res.json(await EmergencyRequest.find().populate('patient','name phone').sort('-createdAt'));
 });
 app.post('/api/admin/emergency/:id/status',auth('admin'),async(req,res)=>{
  if(!['acknowledged','closed'].includes(req.body.status))return res.status(400).json({error:'Status must be acknowledged or closed'});
  const request=await EmergencyRequest.findByIdAndUpdate(req.params.id,{status:req.body.status},{new:true});
  if(!request)return res.status(404).json({error:'Emergency request not found'});
  res.json(request);
 });
}
module.exports={mountPhase5Routes};
