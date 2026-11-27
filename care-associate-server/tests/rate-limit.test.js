const test=require('node:test');
const assert=require('node:assert/strict');
const {RateLimitCounter}=require('../models');
const {rateLimit}=require('../rateLimit');
test('rate limit counter expires and has a unique key',()=>{
 assert.ok(RateLimitCounter.schema.path('key'));
 assert.ok(RateLimitCounter.schema.path('count'));
 assert.ok(RateLimitCounter.schema.path('expiresAt'));
 assert.equal(RateLimitCounter.schema.path('key').options.unique,true);
 assert.ok(RateLimitCounter.schema.indexes().some(([keys,opts])=>keys.expiresAt===1&&opts.expireAfterSeconds===0));
});
test('rate limiter factory returns Express middleware',()=>{
 const middleware=rateLimit({scope:'login',limit:10,windowMs:60000});
 assert.equal(typeof middleware,'function');
 assert.equal(middleware.length,3);
});
