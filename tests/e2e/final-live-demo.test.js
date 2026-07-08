const assert = require('node:assert/strict');
const WebSocket = require('ws');

const BASE_URL = process.env.LIVE_URL || process.env.BASE_URL || 'http://127.0.0.1:3000';

function getWebSocketUrl(token) {
  const url = new URL(BASE_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  return url.toString();
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    redirect: 'manual',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body, text };
}

async function login(email, password) {
  const { response, body } = await request('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, confirm_password: password })
  });
  assert.equal(response.status, 200, `Login failed for ${email}: ${JSON.stringify(body)}`);
  const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [response.headers.get('set-cookie')].filter(Boolean);
  return {
    token: body.token,
    cookie: cookies.map(cookie => cookie.split(';')[0]).join('; ')
  };
}

async function loginAny(accounts) {
  const errors = [];
  for (const account of accounts) {
    try {
      return await login(account.email, account.password);
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(`All login attempts failed: ${errors.join(' | ')}`);
}

function createFinancialUpdateWatcher(token) {
  const ws = new WebSocket(getWebSocketUrl(token));
  let timeout;

  const ready = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  const event = new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Timed out waiting for financial_update WebSocket event'));
    }, 10000);

    ws.on('message', message => {
      const payload = JSON.parse(message.toString());
      if (payload.type === 'financial_update') {
        clearTimeout(timeout);
        ws.close();
        resolve(payload);
      }
    });

    ws.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return { ready, event };
}

async function runFinalLiveDemoTests() {
  console.log(`Running final live demo checks against ${BASE_URL}`);

  const health = await request('/api/health');
  assert.equal(health.response.status, 200, 'Health check must return 200');
  assert.equal(health.body.status, 'ok', 'Health check status must be ok');

  const products = await request('/api/products');
  assert.equal(products.response.status, 200, 'Products endpoint must return 200');
  assert.ok(Array.isArray(products.body), 'Products response must be an array');
  assert.ok(products.body.length > 0, 'Products endpoint must return at least one product');

  const admin = await login('admin@aldi-mock.com', 'adminPassword123');
  const customer = await loginAny([
    { email: 'test_customer@aldi-mock.com', password: 'customerPassword123' },
    { email: 'customer_1@aldi-mock.com', password: 'customerPassword1' }
  ]);
  const adminAccess = await request('/admin.html', {
    headers: {
      Cookie: customer.cookie,
      Authorization: `Bearer ${customer.token}`
    }
  });
  assert.equal(adminAccess.response.status, 403, 'Customer must receive 403 for admin portal');

  const adminApiAccess = await request('/api/admin/database/User', {
    headers: {
      Cookie: customer.cookie,
      Authorization: `Bearer ${customer.token}`
    }
  });
  assert.equal(adminApiAccess.response.status, 403, 'Customer must receive 403 for admin API routes');

  const financeAccess = await request('/api/finance/summary', {
    headers: {
      Cookie: customer.cookie,
      Authorization: `Bearer ${customer.token}`
    }
  });
  assert.equal(financeAccess.response.status, 403, 'Customer must receive 403 for finance summary');

  const product = products.body.find(item => item.stockQuantity > 0) || products.body[0];
  const cartAdd = await request('/api/cart/add', {
    method: 'POST',
    headers: { Cookie: customer.cookie },
    body: JSON.stringify({ productId: product.id, quantity: 1 })
  });
  assert.equal(cartAdd.response.status, 200, 'Customer must be able to add a product to cart');
  assert.ok(cartAdd.body.items.length >= 1, 'Cart must contain at least one item');

  const financialUpdateWatcher = createFinancialUpdateWatcher(admin.token);
  await financialUpdateWatcher.ready;
  const checkout = await request('/api/checkout', {
    method: 'POST',
    headers: {
      Cookie: customer.cookie,
      Authorization: `Bearer ${customer.token}`
    },
    body: JSON.stringify({
      cartItems: [{ productId: product.id, quantity: 1 }],
      paymentMethod: 'demo-card',
      cardLastFour: '4242'
    })
  });
  assert.equal(checkout.response.status, 201, `Checkout must succeed: ${JSON.stringify(checkout.body)}`);
  assert.ok(checkout.body.orderId, 'Checkout response must include an order id');
  assert.ok(checkout.body.totalAmount > 0, 'Checkout response must include a positive total');

  const financialUpdate = await financialUpdateWatcher.event;
  assert.equal(financialUpdate.data.transactionType, 'ecommerce_sale', 'WebSocket must emit ecommerce_sale update');
  assert.equal(financialUpdate.data.orderId, checkout.body.orderId, 'WebSocket order id must match checkout response');

  const financeSummary = await request('/api/finance/summary', {
    headers: {
      Cookie: admin.cookie,
      Authorization: `Bearer ${admin.token}`
    }
  });
  assert.equal(financeSummary.response.status, 200, `Admin finance summary must return 200: ${JSON.stringify(financeSummary.body)}`);
  assert.ok(financeSummary.body.summary.totalRevenue >= checkout.body.totalAmount, 'Finance dashboard revenue must include checkout revenue');

  console.log('Final live demo checks passed.');
}

if (require.main === module) {
  runFinalLiveDemoTests().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = runFinalLiveDemoTests;
