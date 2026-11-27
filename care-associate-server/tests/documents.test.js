const test=require('node:test');
const assert=require('node:assert/strict');
const {app}=require('../index');
const {PrivateDocument}=require('../models');
function has(method,path){return app._router.stack.some(x=>x.route&&x.route.path===path&&x.route.methods[method]);}
test('private document vault routes are mounted for authenticated users',()=>{
 assert.equal(has('get','/api/documents'),true);
 assert.equal(has('post','/api/documents'),true);
 assert.equal(has('get','/api/documents/:id/file'),true);
 assert.equal(has('delete','/api/documents/:id'),true);
});
test('admin helper document review routes are mounted',()=>{
 assert.equal(has('get','/api/admin/documents'),true);
 assert.equal(has('get','/api/admin/documents/:id/file'),true);
 assert.equal(has('patch','/api/admin/documents/:id/review'),true);
});
test('private document schema restricts role, category, format and review state',()=>{
 assert.ok(PrivateDocument.schema.path('owner'));
 assert.deepEqual(PrivateDocument.schema.path('role').enumValues,['patient','helper']);
 assert.deepEqual(PrivateDocument.schema.path('format').enumValues,['jpg','png']);
 assert.deepEqual(PrivateDocument.schema.path('reviewStatus').enumValues,['not_required','pending','approved','rejected']);
 assert.equal(PrivateDocument.schema.path('publicId').options.select,false);
 assert.ok(PrivateDocument.schema.path('expiryAt'));
});
