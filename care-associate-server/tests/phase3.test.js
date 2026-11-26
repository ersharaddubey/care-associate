const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../index');

function hasRoute(method, path) {
  return app._router.stack.some((layer) => layer.route
    && layer.route.path === path
    && layer.route.methods[method]);
}

test('Phase 3 push registration route is mounted under the API prefix', () => {
  assert.equal(hasRoute('post', '/api/push-token'), true);
  assert.equal(hasRoute('delete', '/api/push-token'), true);
});

test('Phase 3 chat routes are mounted under the API prefix', () => {
  assert.equal(hasRoute('get', '/api/bookings/:id/chat'), true);
  assert.equal(hasRoute('post', '/api/bookings/:id/chat'), true);
});

test('Phase 3 live location and ETA routes are mounted under the API prefix', () => {
  assert.equal(hasRoute('post', '/api/bookings/:id/location'), true);
  assert.equal(hasRoute('get', '/api/bookings/:id/location'), true);
  assert.equal(hasRoute('post', '/api/bookings/:id/eta'), true);
});
