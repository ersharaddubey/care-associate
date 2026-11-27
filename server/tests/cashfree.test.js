const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.CASHFREE_CLIENT_ID = 'test-client';
process.env.CASHFREE_CLIENT_SECRET = 'test-secret-for-signature-check';
process.env.CASHFREE_ENV = 'SANDBOX';

const { verifyWebhookSignature, cashfreeConfig } = require('../cashfree');

test('Cashfree webhook signature accepts the exact signed raw body', () => {
  const timestamp = '1732600000';
  const rawBody = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'ca_test' } } });
  const signature = crypto.createHmac('sha256', process.env.CASHFREE_CLIENT_SECRET)
    .update(timestamp + rawBody).digest('base64');
  assert.equal(verifyWebhookSignature(signature, timestamp, rawBody), true);
  assert.equal(verifyWebhookSignature(signature, timestamp, rawBody + ' '), false);
});

test('Cashfree webhook signature rejects missing signature headers', () => {
  assert.equal(verifyWebhookSignature('', '1732600000', '{}'), false);
  assert.equal(verifyWebhookSignature('signature', '', '{}'), false);
});

test('Cashfree defaults to the sandbox endpoint and rejects unknown environments', () => {
  assert.equal(cashfreeConfig().baseUrl, 'https://sandbox.cashfree.com/pg');
  process.env.CASHFREE_ENV = 'LIVE';
  assert.throws(() => cashfreeConfig(), /CASHFREE_ENV must be SANDBOX or PRODUCTION/);
  process.env.CASHFREE_ENV = 'SANDBOX';
});
