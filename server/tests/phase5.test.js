const test=require('node:test');
const assert=require('node:assert/strict');
const {app}=require('../index');
const {User,Booking,EmergencyRequest}=require('../models');
function has(method,path){return app._router.stack.some(x=>x.route&&x.route.path===path&&x.route.methods[method]);}
test('patient family, hospital, favourite and language routes are mounted',()=>{
 assert.equal(has('get','/api/patient/experience'),true);
 assert.equal(has('post','/api/patient/favourites/:helperId'),true);
 assert.equal(has('post','/api/patient/family'),true);
 assert.equal(has('patch','/api/patient/family/:id'),true);
 assert.equal(has('delete','/api/patient/family/:id'),true);
 assert.equal(has('post','/api/patient/hospitals'),true);
 assert.equal(has('delete','/api/patient/hospitals/:id'),true);
 assert.equal(has('put','/api/me/language'),true);
});
test('emergency assistance routes are mounted with admin status controls',()=>{
 assert.equal(has('post','/api/emergency/request'),true);
 assert.equal(has('get','/api/emergency/mine'),true);
 assert.equal(has('get','/api/admin/emergency'),true);
 assert.equal(has('post','/api/admin/emergency/:id/status'),true);
});
test('patient experience and emergency data are represented in schemas',()=>{
 assert.ok(User.schema.path('favoriteHelpers'));
 assert.ok(User.schema.path('familyProfiles'));
 assert.ok(User.schema.path('savedHospitals'));
 assert.ok(User.schema.path('language'));
 assert.ok(Booking.schema.path('patientProfile.name'));
 assert.ok(EmergencyRequest.schema.path('status'));
});
