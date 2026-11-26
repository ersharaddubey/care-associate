const crypto=require('crypto');
const API_VERSION=process.env.CASHFREE_API_VERSION||'2023-08-01';
function cashfreeConfig(){
 const clientId=process.env.CASHFREE_CLIENT_ID,clientSecret=process.env.CASHFREE_CLIENT_SECRET;
 const environment=String(process.env.CASHFREE_ENV||'SANDBOX').toUpperCase();
 if(!clientId||!clientSecret)throw new Error('Cashfree is not configured. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET.');
 if(!['SANDBOX','PRODUCTION'].includes(environment))throw new Error('CASHFREE_ENV must be SANDBOX or PRODUCTION');
 return {clientId,clientSecret,environment,baseUrl:environment==='PRODUCTION'?'https://api.cashfree.com/pg':'https://sandbox.cashfree.com/pg'};
}
async function cashfreeRequest(method,pathname,body,idempotencyKey){
 const c=cashfreeConfig(),response=await fetch(c.baseUrl+pathname,{method,headers:{'Content-Type':'application/json','x-client-id':c.clientId,'x-client-secret':c.clientSecret,'x-api-version':API_VERSION,...(idempotencyKey?{'x-idempotency-key':idempotencyKey}:{})},body:body?JSON.stringify(body):undefined});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`Cashfree error (${response.status}): ${data.message||data.type||'Cashfree request failed'}`);return data;
}
function verifyWebhookSignature(signature,timestamp,rawBody){
 const {clientSecret}=cashfreeConfig();if(!signature||!timestamp||typeof rawBody!=='string')return false;
 const expected=crypto.createHmac('sha256',clientSecret).update(timestamp+rawBody).digest('base64'),a=Buffer.from(expected),b=Buffer.from(String(signature));
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function createCashfreeOrder({orderId,amount,customerId,customerPhone,customerEmail}){
 const c=cashfreeConfig(),digits=String(customerPhone||'').replace(/\D/g,'').slice(-10);
 if(!/^\d{10}$/.test(digits))throw new Error('A valid 10-digit patient mobile number is required for Cashfree payment');
 const result=await cashfreeRequest('POST','/orders',{order_id:orderId,order_amount:Number(Number(amount).toFixed(2)),order_currency:'INR',customer_details:{customer_id:String(customerId).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,50),customer_phone:digits,...(customerEmail?{customer_email:String(customerEmail).slice(0,100)}:{})},order_note:'Care Associate booking payment'});
 if(!result.payment_session_id)throw new Error('Cashfree did not return a payment session');return {...result,environment:c.environment};
}
async function fetchCashfreeOrder(id){return cashfreeRequest('GET','/orders/'+encodeURIComponent(id));}
async function createCashfreeRefund({orderId,refundId,amount,reason}){
 return cashfreeRequest('POST','/orders/'+encodeURIComponent(orderId)+'/refunds',{refund_id:refundId,refund_amount:Number(Number(amount).toFixed(2)),refund_note:String(reason||'Admin-approved refund').slice(0,200)},crypto.randomUUID());
}
async function fetchCashfreeRefunds(id){return cashfreeRequest('GET','/orders/'+encodeURIComponent(id)+'/refunds');}
module.exports={cashfreeConfig,cashfreeRequest,createCashfreeOrder,fetchCashfreeOrder,createCashfreeRefund,fetchCashfreeRefunds,verifyWebhookSignature};
