const test=require('node:test');
const assert=require('node:assert/strict');
const {app}=require('../index');
function has(method,path){return app._router.stack.some(x=>x.route&&x.route.path===path&&x.route.methods[method]);}
test('admin manual assignment and safe unassignment routes are mounted',()=>{
 assert.equal(has('post','/api/admin/bookings/:id/assign'),true);
 assert.equal(has('post','/api/admin/bookings/:id/unassign'),true);
});
