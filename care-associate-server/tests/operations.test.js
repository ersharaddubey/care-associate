const test=require('node:test');
const assert=require('node:assert/strict');
const {app}=require('../index');
const {Booking,NotificationPreference,NotificationDelivery,ServiceCatalog}=require('../models');
function has(method,path){return app._router.stack.some(x=>x.route&&x.route.path===path&&x.route.methods[method]);}
test('booking reschedule and visit operations routes are mounted',()=>{
 assert.equal(has('post','/api/bookings/:id/reschedule'),true);
 assert.equal(has('get','/api/bookings/:id/visit'),true);
 assert.equal(has('patch','/api/bookings/:id/visit/checklist'),true);
 assert.equal(has('patch','/api/bookings/:id/visit/handover'),true);
 assert.equal(has('post','/api/bookings/:id/safety-check-in'),true);
 assert.equal(has('post','/api/bookings/:id/safety-check-out'),true);
});
test('service catalogue and notification preference routes are mounted',()=>{
 assert.equal(has('get','/api/services'),true);
 assert.equal(has('get','/api/admin/services'),true);
 assert.equal(has('put','/api/admin/services/:key'),true);
 assert.equal(has('get','/api/notification-preferences'),true);
 assert.equal(has('patch','/api/notification-preferences'),true);
 assert.equal(has('get','/api/admin/notification-deliveries'),true);
});
test('new operational schemas enforce bounded booking and preference fields',()=>{
 assert.ok(Booking.schema.path('rescheduleCount'));
 assert.ok(Booking.schema.path('visitChecklist'));
 assert.ok(Booking.schema.path('handoverNote'));
 assert.ok(Booking.schema.path('safetyCheckInAt'));
 assert.ok(NotificationPreference.schema.path('pushEnabled'));
 assert.ok(NotificationPreference.schema.path('bookingUpdates'));
 assert.ok(NotificationDelivery.schema.path('status'));
 assert.ok(ServiceCatalog.schema.path('key'));
 assert.deepEqual(ServiceCatalog.schema.path('key').enumValues,['queue','report','accompany','medicine','admission','insurance','other']);
});
