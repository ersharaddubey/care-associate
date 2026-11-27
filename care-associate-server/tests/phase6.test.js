const test=require('node:test');
const assert=require('node:assert/strict');
const {app}=require('../index');
const {User,Booking,Review,IncidentReport,Payout,AuditLog}=require('../models');
const {distanceKm}=require('../phase6');
function has(method,path){return app._router.stack.some(x=>x.route&&x.route.path===path&&x.route.methods[method]);}

test('lifecycle, matching and review endpoints are mounted',()=>{
 assert.equal(has('post','/api/bookings/:id/on-the-way'),true);
 assert.equal(has('post','/api/bookings/:id/review'),true);
 assert.equal(has('get','/api/matching/associates'),true);
 assert.equal(has('put','/api/me/matching-location'),true);
 assert.equal(has('delete','/api/me/matching-location'),true);
});
test('incident, suspension, payout and reconciliation endpoints are mounted',()=>{
 assert.equal(has('post','/api/incidents'),true);
 assert.equal(has('get','/api/incidents/mine'),true);
 assert.equal(has('get','/api/admin/incidents'),true);
 assert.equal(has('patch','/api/admin/incidents/:id'),true);
 assert.equal(has('post','/api/admin/helpers/:id/suspension'),true);
 assert.equal(has('post','/api/admin/helpers/:id/payouts'),true);
 assert.equal(has('get','/api/helper/payouts'),true);
 assert.equal(has('get','/api/helper/performance'),true);
 assert.equal(has('get','/api/admin/reconciliation'),true);
 assert.equal(has('get','/api/admin/audit-logs'),true);
 assert.equal(has('patch','/api/admin/payouts/:id'),true);
});
test('Phase 6 schemas persist lifecycle, trust and finance records',()=>{
 assert.ok(User.schema.path('isSuspended'));
 assert.ok(User.schema.path('ratingAverage'));
 assert.ok(User.schema.path('matchingLocation.latitude'));
 assert.ok(Booking.schema.path('statusHistory'));
 assert.ok(Booking.schema.path('onTheWayAt'));
 assert.ok(Review.schema.path('booking'));
 assert.ok(IncidentReport.schema.path('status'));
 assert.ok(Payout.schema.path('reference'));
 assert.ok(Payout.schema.path('statusHistory'));
 assert.ok(AuditLog.schema.path('actor'));
});
test('distance matching uses straight-line haversine distance',()=>{
 const km=distanceKm({latitude:28.6139,longitude:77.2090},{latitude:28.7041,longitude:77.1025});
 assert.ok(km>10&&km<20);
});
