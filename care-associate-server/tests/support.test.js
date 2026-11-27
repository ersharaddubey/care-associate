const test=require('node:test');
const assert=require('node:assert/strict');
const {app}=require('../index');
const {SupportTicket}=require('../models');
function has(method,path){return app._router.stack.some(x=>x.route&&x.route.path===path&&x.route.methods[method]);}
test('patient and helper support ticket routes are mounted',()=>{
 assert.equal(has('get','/api/support/tickets'),true);
 assert.equal(has('post','/api/support/tickets'),true);
 assert.equal(has('post','/api/support/tickets/:id/messages'),true);
});
test('admin support ticket management routes are mounted',()=>{
 assert.equal(has('get','/api/admin/support/tickets'),true);
 assert.equal(has('patch','/api/admin/support/tickets/:id'),true);
});
test('support ticket schema stores owner-scoped conversations and lifecycle status',()=>{
 assert.ok(SupportTicket.schema.path('owner'));
 assert.ok(SupportTicket.schema.path('role'));
 assert.ok(SupportTicket.schema.path('subject'));
 assert.ok(SupportTicket.schema.path('category'));
 assert.ok(SupportTicket.schema.path('status'));
 assert.ok(SupportTicket.schema.path('messages'));
 assert.equal(SupportTicket.schema.path('status').enumValues.includes('resolved'),true);
});
