const test=require('node:test');const assert=require('node:assert/strict');const {app}=require('../index');
function has(method,path){return app._router.stack.some(x=>x.route&&x.route.path===path&&x.route.methods[method]);}
test('Phase 4 earnings and invoice routes are mounted',()=>{assert.equal(has('get','/api/helper/earnings'),true);assert.equal(has('get','/api/bookings/:id/invoice'),true);});
test('Phase 4 finance and refund routes are mounted',()=>{assert.equal(has('get','/api/admin/finance'),true);assert.equal(has('post','/api/admin/bookings/:id/refunds'),true);assert.equal(has('post','/api/admin/bookings/:id/refunds/:refundId/sync'),true);});
