const crypto = require('crypto');

const API_VERSION = process.env.CASHFREE_API_VERSION || '2023-08-01';

function cashfreeConfig() {
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const environment = String(process.env.CASHFREE_ENV || 'SANDBOX').toUpperCase();
  if (!clientId || !clientSecret) throw new Error('Cashfree is not configured. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET.');
  if (!['SANDBOX', 'PRODUCTION'].includes(environment)) throw new Error('CASHFREE_ENV must be SANDBOX or PRODUCTION');
  return {
    clientId,
    clientSecret,
    environment,
    baseUrl: environment === 'PRODUCTION' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg',
  };
}

async function cashfreeRequest(method, pathname, body) {
  const config = cashfreeConfig();
  const response = await fetch(config.baseUrl + pathname, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': config.clientId,
      'x-client-secret': config.clientSecret,
      'x-api-version': API_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || data.type || 'Cashfree request failed';
    throw new Error(`Cashfree error (${response.status}): ${message}`);
  }
  return data;
}

function verifyWebhookSignature(signature, timestamp, rawBody) {
  const { clientSecret } = cashfreeConfig();
  if (!signature || !timestamp || typeof rawBody !== 'string') return false;
  const expected = crypto.createHmac('sha256', clientSecret).update(timestamp + rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function createCashfreeOrder({ orderId, amount, customerId, customerPhone, customerEmail }) {
  const config = cashfreeConfig();
  const digits = String(customerPhone || '').replace(/\D/g, '').slice(-10);
  if (!/^\d{10}$/.test(digits)) throw new Error('A valid 10-digit patient mobile number is required for Cashfree payment');
  const result = await cashfreeRequest('POST', '/orders', {
    order_id: orderId,
    order_amount: Number(Number(amount).toFixed(2)),
    order_currency: 'INR',
    customer_details: {
      customer_id: String(customerId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50),
      customer_phone: digits,
      ...(customerEmail ? { customer_email: String(customerEmail).slice(0, 100) } : {}),
    },
    order_note: 'Care Associate booking payment',
  });
  if (!result.payment_session_id) throw new Error('Cashfree did not return a payment session');
  return { ...result, environment: config.environment };
}

async function fetchCashfreeOrder(orderId) {
  return cashfreeRequest('GET', '/orders/' + encodeURIComponent(orderId));
}

module.exports = {
  cashfreeConfig,
  cashfreeRequest,
  createCashfreeOrder,
  fetchCashfreeOrder,
  verifyWebhookSignature,
};
