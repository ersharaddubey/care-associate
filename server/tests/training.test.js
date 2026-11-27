const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../index');
const { User } = require('../models');
const { MODULES, publicModule } = require('../training');

function has(method, path) {
  return app._router.stack.some(layer => layer.route && layer.route.path === path && layer.route.methods[method]);
}

test('helper training routes are mounted behind role authorization', () => {
  assert.equal(has('get', '/api/helper/training'), true);
  assert.equal(has('post', '/api/helper/training/:moduleId/complete'), true);
});

test('training progress is stored on the user schema', () => {
  assert.ok(User.schema.path('trainingProgress'));
});

test('public training catalogue does not expose answer keys', () => {
  assert.ok(MODULES.length >= 5);
  for (const module of MODULES) {
    const visible = publicModule(module);
    assert.equal(visible.questions.length, module.questions.length);
    assert.ok(visible.questions.every(question => !Object.hasOwn(question, 'answer')));
    assert.ok(visible.lessons.length >= 3);
  }
});
