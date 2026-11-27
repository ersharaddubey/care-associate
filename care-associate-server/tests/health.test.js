const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../index');

test('health endpoint is mounted and reports service/database state', () => {
  const route = app._router.stack.find((layer) => layer.route && layer.route.path === '/api/health');
  assert.ok(route, 'GET /api/health should be mounted');
  assert.equal(route.route.methods.get, true);
});


test('exports the Express application directly for Vercel', () => {
  assert.equal(typeof app, 'function');
  assert.equal(app.app, app);
  assert.equal(typeof app.ensureInitialized, 'function');
});

test('health endpoint reports MongoDB state without running API bootstrap', async () => {
  const mongoose = require('mongoose');
  const server = app.listen(0);
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    const body = await response.json();
    const connected = mongoose.connection.readyState === 1;
    assert.equal(response.status, connected ? 200 : 503);
    assert.equal(body.ok, connected);
    assert.equal(body.database, connected ? 'connected' : 'disconnected');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
