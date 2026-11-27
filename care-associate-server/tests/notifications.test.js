const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../index');
const { Notification } = require('../models');

function has(method, path) {
  return app._router.stack.some((layer) => layer.route && layer.route.path === path && layer.route.methods[method]);
}

test('authenticated in-app notification inbox routes are mounted', () => {
  assert.equal(has('get', '/api/notifications'), true);
  assert.equal(has('patch', '/api/notifications/:id/read'), true);
  assert.equal(has('post', '/api/notifications/read-all'), true);
  assert.equal(has('delete', '/api/notifications/:id'), true);
});

test('notification schema stores recipient, content, metadata and read state', () => {
  assert.ok(Notification.schema.path('recipient'));
  assert.ok(Notification.schema.path('title'));
  assert.ok(Notification.schema.path('body'));
  assert.ok(Notification.schema.path('data'));
  assert.ok(Notification.schema.path('readAt'));
});
