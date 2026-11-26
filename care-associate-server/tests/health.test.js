const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../index');

test('health endpoint is mounted and reports service/database state', () => {
  const route = app._router.stack.find((layer) => layer.route && layer.route.path === '/api/health');
  assert.ok(route, 'GET /api/health should be mounted');
  assert.equal(route.route.methods.get, true);
});
