const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'aldi_secret_jwt_key_2026';

async function testSearchAPI() {
  console.log('[Test] Starting Document & Section Search Integration Tests...');
  let passed = 0;
  let failed = 0;

  try {
    // Generate JWT tokens
    const adminToken = jwt.sign(
      { id: 'admin-uuid', email: 'admin@aldi-mock.com', first_name: 'Admin', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const customerToken = jwt.sign(
      { id: 'customer-uuid', email: 'customer@aldi-mock.com', first_name: 'Customer', role: 'customer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // ====================================================
    // TEST 1: Admin can search documents successfully
    // ====================================================
    console.log('\n[Test 1] Admin searches for documents containing "report" keyword...');
    try {
      const res = await fetch('http://localhost:3001/api/documents/search?q=report', {
        method: 'GET',
        headers: {
          'Cookie': `aldi_jwt=${adminToken}`
        }
      });

      const body = await res.json();

      if (res.status !== 200) {
        throw new Error(`Expected status 200, got ${res.status}: ${JSON.stringify(body)}`);
      }
      if (!body.query || !body.documents) {
        throw new Error(`Invalid response structure: ${JSON.stringify(body)}`);
      }
      if (typeof body.query.sentiment !== 'object' || !Array.isArray(body.documents)) {
        throw new Error(`Response missing sentiment or documents array`);
      }

      console.log('[Test 1] ✅ PASSED — Admin retrieved search response successfully. Sentiment: ' + body.query.sentiment.label);
      passed++;
    } catch (err) {
      console.error(`[Test 1] ❌ FAILED — ${err.message}`);
      failed++;
    }

    // ====================================================
    // TEST 2: Customer JWT search attempt is rejected with 403 Forbidden
    // ====================================================
    console.log('\n[Test 2] Customer search attempt is rejected with 403 Forbidden...');
    try {
      const res = await fetch('http://localhost:3001/api/documents/search?q=report', {
        method: 'GET',
        headers: {
          'Cookie': `aldi_jwt=${customerToken}`
        }
      });

      if (res.status !== 403) {
        throw new Error(`Expected status 403 Forbidden, got ${res.status}`);
      }

      console.log('[Test 2] ✅ PASSED — Customer search rejected with 403 Forbidden');
      passed++;
    } catch (err) {
      console.error(`[Test 2] ❌ FAILED — ${err.message}`);
      failed++;
    }

    // ====================================================
    // TEST 3: Anonymous request is rejected with 401 Unauthorized
    // ====================================================
    console.log('\n[Test 3] Anonymous search attempt is rejected with 401 Unauthorized...');
    try {
      const res = await fetch('http://localhost:3001/api/documents/search?q=report', {
        method: 'GET'
      });

      if (res.status !== 401) {
        throw new Error(`Expected status 401 Unauthorized, got ${res.status}`);
      }

      console.log('[Test 3] ✅ PASSED — Anonymous search rejected with 401 Unauthorized');
      passed++;
    } catch (err) {
      console.error(`[Test 3] ❌ FAILED — ${err.message}`);
      failed++;
    }

    // ====================================================
    // TEST 4: Empty query returns empty array + neutral sentiment
    // ====================================================
    console.log('\n[Test 4] Empty query request returns default empty state...');
    try {
      const res = await fetch('http://localhost:3001/api/documents/search', {
        method: 'GET',
        headers: {
          'Cookie': `aldi_jwt=${adminToken}`
        }
      });

      const body = await res.json();
      if (body.documents.length !== 0 || body.query.sentiment.label !== 'Neutral') {
        throw new Error(`Expected empty documents list & Neutral query sentiment, got: ${JSON.stringify(body)}`);
      }

      console.log('[Test 4] ✅ PASSED — Empty search returns neutral empty state');
      passed++;
    } catch (err) {
      console.error(`[Test 4] ❌ FAILED — ${err.message}`);
      failed++;
    }

  } catch (error) {
    console.error('[Test] Setup failed:', error.message);
    failed++;
  }

  console.log(`\n[Search API Tests] ${passed} passed, ${failed} failed`);
  return failed === 0;
}

if (require.main === module) {
  testSearchAPI().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = testSearchAPI;
