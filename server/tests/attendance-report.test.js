const test=require('node:test');
const assert=require('node:assert/strict');
const {app}=require('../index');
function has(method,path){return app._router.stack.some(x=>x.route&&x.route.path===path&&x.route.methods[method]);}
test('admin attendance report and CSV export routes are mounted',()=>{
 assert.equal(has('get','/api/admin/reports/attendance'),true);
 assert.equal(has('get','/api/admin/reports/attendance.csv'),true);
});
