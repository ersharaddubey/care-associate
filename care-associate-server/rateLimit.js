const crypto=require('crypto');
const {RateLimitCounter}=require('./models');

function rateLimit({scope,limit,windowMs}) {
 return async(req,res,next)=>{
  try {
   const now=Date.now(),bucket=Math.floor(now/windowMs),resetAt=(bucket+1)*windowMs;
   const ip=crypto.createHash('sha256').update(String(req.ip||req.socket?.remoteAddress||'unknown')).digest('hex').slice(0,24);
   const key=scope+':'+ip+':'+bucket;
   let counter;
   try {
    counter=await RateLimitCounter.findOneAndUpdate({key},{$inc:{count:1},$setOnInsert:{expiresAt:new Date(resetAt)}},{upsert:true,new:true,setDefaultsOnInsert:true});
   } catch(error) {
    if(error.code!==11000) throw error;
    await RateLimitCounter.updateOne({key},{$inc:{count:1}});
    counter=await RateLimitCounter.findOne({key}).lean();
   }
   res.set('RateLimit-Limit',String(limit));
   res.set('RateLimit-Remaining',String(Math.max(0,limit-Number(counter?.count||0))));
   res.set('RateLimit-Reset',String(Math.ceil(resetAt/1000)));
   if(Number(counter?.count||0)>limit) return res.status(429).json({error:'Too many requests. Please wait and try again.'});
   next();
  } catch(error) { next(error); }
 };
}
module.exports={rateLimit};
