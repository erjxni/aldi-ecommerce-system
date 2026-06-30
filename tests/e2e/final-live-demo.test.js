const assert = require('node:assert/strict');

const BASE_URL = process.env.LIVE_URL || process.env.BASE_URL || 'http://127.0.0.1:3000';

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

async function runFinalLiveDemoTests() {
  console.log(`Running final live demo checks against ${BASE_URL}`);

  const health = await request('/api/health');
  assert.equal(health.response.status, 200, 'Health check must return 200');
  assert.equal(health.body.status, 'ok', 'Health check status must be ok');

  const products = await request('/api/products');
  assert.equal(products.response.status, 200, 'Products endpoint must return 200');
  assert.ok(Array.isArray(products.body), 'Products response must be an array');
  assert.ok(products.body.length > 0, 'Products endpoint must return at least one product');

  const customer = await login('test_customer@aldi-mock.com', 'customerPassword123');
  const adminAccess = await request('/admin.html', {
    headers: {
      Cookie: customer.cookie,
      Authorization: `Bearer ${customer.token}`
    }
  });
  assert.equal(adminAccess.response.status, 403, 'Customer must receive 403 for admin portal');

  const product = products.body.find(item => item.stockQuantity > 0) || products.body[0];
  const cartAdd = await request('/api/cart/add', {
    method: 'POST',
    headers: { Cookie: customer.cookie },
    body: JSON.stringify({ productId: product.id, quantity: 1 })
  });
  assert.equal(cartAdd.response.status, 200, 'Customer must be able to add a product to cart');
  assert.ok(cartAdd.body.items.length >= 1, 'Cart must contain at least one item');

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

  console.log('Final live demo checks passed.');
}

if (require.main === module) {
  runFinalLiveDemoTests().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = runFinalLiveDemoTests;
