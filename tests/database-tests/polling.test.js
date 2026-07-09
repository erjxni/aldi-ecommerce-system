/**
 * SCRUM-194: Polling System Test Suite
 *
 * Tests:
 * 1. Tables exist and are accessible
 * 2. Admin can create a poll
 * 3. Employee/Financial_officer cannot create a poll (403)
 * 4. Customer gets 403 on all poll endpoints
 * 5. Internal user can vote on a poll
 * 6. Duplicate vote returns 409 Conflict  ← SCRUM-194 core requirement
 * 7. Vote aggregation returns correct counts
 * 8. Invalid option is rejected
 *
 * Run:  node tests/database-tests/polling.test.js
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const path = require('path');
const http = require('http');

// ─── Firebase Setup ──────────────────────────────────────────────
let serviceAccount;
if (process.env.ALDI_SQL_CONNECT_API_KEY) {
  serviceAccount = JSON.parse(process.env.ALDI_SQL_CONNECT_API_KEY);
} else {
  const keyPath = path.join(__dirname, '../../aldi-ecommerce-managemen-b40e8-firebase-adminsdk-fbsvc-b76cea1fbf.json');
  serviceAccount = require(keyPath);
}

const firebaseApp = initializeApp(
  { credential: cert(serviceAccount) },
  `polls-test-${Date.now()}`
);
const sqlConnect = getDataConnect(
  { serviceId: 'aldi-ecommerce-managemen-b40e8-service', location: 'europe-west3' },
  firebaseApp
);

// ─── Test Helpers ────────────────────────────────────────────────
const SERVER_BASE = process.env.TEST_SERVER || 'http://localhost:3001';
let passed = 0;
let failed = 0;
const createdPollIds = [];

function log(msg, type = 'INFO') {
  const icons = { INFO: 'ℹ️', PASS: '✅', FAIL: '❌', WARN: '⚠️' };
  console.log(`${icons[type] || ''} [${type}] ${msg}`);
}

async function apiCall(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(SERVER_BASE + path);
    const postData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function assert(condition, testName, details = '') {
  if (condition) {
    log(`${testName}`, 'PASS');
    passed++;
  } else {
    log(`${testName} | ${details}`, 'FAIL');
    failed++;
  }
}

// ─── Get real tokens from the database ───────────────────────────
async function getTestTokens() {
  // We create mock JWT tokens that the server can verify
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'aldi_secret_jwt_key_2026';

  // Look up real user IDs from DB for more realistic tests
  let adminUserId = 'test-admin-id-0000000000000000';
  let employeeUserId = 'test-emp-id-000000000000000000';
  let customerUserId = 'test-cust-id-00000000000000000';

  try {
    const result = await sqlConnect.executeGraphqlRead(`
      query GetTestUsers {
        _select(sql: "SELECT id, email, role FROM \\"user\\" WHERE role IN ('admin', 'employee', 'customer') LIMIT 10")
      }
    `);
    const users = (result.data && result.data._select) || [];
    const adminUser = users.find(u => u.role === 'admin');
    const empUser = users.find(u => u.role === 'employee');
    const custUser = users.find(u => u.role === 'customer');
    if (adminUser) adminUserId = adminUser.id;
    if (empUser) employeeUserId = empUser.id;
    if (custUser) customerUserId = custUser.id;
  } catch (e) {
    log('Could not fetch real user IDs, using synthetic test IDs', 'WARN');
  }

  const adminToken = jwt.sign(
    { id: adminUserId, email: 'admin@test.aldi', role: 'admin', first_name: 'Test Admin' },
    JWT_SECRET, { expiresIn: '1h' }
  );

  const employeeToken = jwt.sign(
    { id: employeeUserId, email: 'emp@test.aldi', role: 'employee', first_name: 'Test Employee' },
    JWT_SECRET, { expiresIn: '1h' }
  );

  const financialOfficerToken = jwt.sign(
    { id: 'test-fin-id-000000000000000000', email: 'fin@test.aldi', role: 'financial_officer', first_name: 'Test FinOff' },
    JWT_SECRET, { expiresIn: '1h' }
  );

  const customerToken = jwt.sign(
    { id: customerUserId, email: 'cust@test.aldi', role: 'customer', first_name: 'Test Customer' },
    JWT_SECRET, { expiresIn: '1h' }
  );

  return { adminToken, employeeToken, financialOfficerToken, customerToken, adminUserId, employeeUserId };
}

// ─── Direct DB helper: raw query ─────────────────────────────────
async function dbExecute(sql) {
  const mutation = `mutation TestExec { _execute(sql: ${JSON.stringify(sql)}) }`;
  await sqlConnect.executeGraphql(mutation);
}

async function dbSelect(sql) {
  const query = `query TestSelect { _select(sql: ${JSON.stringify(sql.replace(/\s+/g, ' ').trim())}) }`;
  const res = await sqlConnect.executeGraphqlRead(query);
  return (res.data && res.data._select) || [];
}

// ─── Cleanup helper ───────────────────────────────────────────────
async function cleanupTestPolls() {
  for (const id of createdPollIds) {
    try {
      await sqlConnect.executeGraphql(`
        mutation CleanupPoll {
          _execute(sql: "DELETE FROM \\"poll\\" WHERE id = '${id}'")
        }
      `);
    } catch (e) {
      // best-effort cleanup
    }
  }
}

// ─── TEST SUITE ───────────────────────────────────────────────────
async function runTests() {
  log('=== ALDI Polling System Test Suite (SCRUM-190 to SCRUM-194) ===\n');

  // Start Express server programmatically if not already running
  const { server } = require('../../backend/server.js');
  if (!server.listening) {
    await new Promise((resolve, reject) => {
      server.listen(3001, () => {
        log('Server started on port 3001 for polling tests', 'INFO');
        resolve();
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          log('Port 3001 already in use, assuming server is running.', 'INFO');
          resolve();
        } else {
          reject(err);
        }
      });
    });
  }

  const { adminToken, employeeToken, financialOfficerToken, customerToken, adminUserId, employeeUserId } = await getTestTokens();

  // ── Test 1: Poll table exists ──────────────────────────────────
  log('\n--- Test Group 1: Database Schema (SCRUM-190) ---');
  try {
    const pollRows = await dbSelect(`SELECT CAST(COUNT(*) AS INT) AS "count" FROM "poll" LIMIT 1`);
    assert(pollRows.length > 0, 'T1.1: poll table exists and is queryable');
  } catch (e) {
    assert(false, 'T1.1: poll table exists', e.message);
  }

  // ── Test 2: Vote table exists ──────────────────────────────────
  try {
    const voteRows = await dbSelect(`SELECT CAST(COUNT(*) AS INT) AS "count" FROM "vote" LIMIT 1`);
    assert(voteRows.length > 0, 'T1.2: vote table exists and is queryable');
  } catch (e) {
    assert(false, 'T1.2: vote table exists', e.message);
  }

  // ── Test 3: Vote table has UNIQUE constraint ───────────────────
  try {
    const constraintRows = await dbSelect(`
      SELECT constraint_name FROM information_schema.table_constraints 
      WHERE table_name = 'vote' AND constraint_type IN ('UNIQUE', 'PRIMARY KEY')
    `);
    const hasUnique = constraintRows.some(r =>
      Object.values(r).some(v => String(v).includes('uq_vote_poll_user') || String(v).includes('vote_pkey'))
    );
    assert(hasUnique, 'T1.3: vote table has UNIQUE or PRIMARY KEY (poll_id, user_id) constraint');
  } catch (e) {
    assert(false, 'T1.3: UNIQUE constraint exists', e.message);
  }

  // ── Test 4: Admin can create a poll ───────────────────────────
  log('\n--- Test Group 2: API Authorization (SCRUM-191) ---');
  let testPollId = null;
  try {
    const res = await apiCall('POST', '/api/polls', {
      title: '[TEST] Governance Strategy Vote',
      description: 'This is an automated test poll',
      options: ['Option A', 'Option B', 'Option C'],
      closesAt: null
    }, adminToken);

    assert(res.status === 201, 'T2.1: Admin can create a poll (201)', `Got status ${res.status}`);
    if (res.status === 201 && res.body.poll && res.body.poll.id) {
      testPollId = res.body.poll.id;
      createdPollIds.push(testPollId);
      log(`     Created test poll: ${testPollId}`, 'INFO');
    }
  } catch (e) {
    assert(false, 'T2.1: Admin poll creation', e.message);
  }

  // ── Test 5: Employee cannot create a poll (403) ────────────────
  try {
    const res = await apiCall('POST', '/api/polls', {
      title: '[TEST] Employee Poll',
      options: ['A', 'B']
    }, employeeToken);
    assert(res.status === 403, 'T2.2: Employee gets 403 when creating poll (admin-only)', `Got status ${res.status}`);
  } catch (e) {
    assert(false, 'T2.2: Employee poll creation forbidden', e.message);
  }

  // ── Test 6: Financial Officer cannot create a poll ─────────────
  try {
    const res = await apiCall('POST', '/api/polls', {
      title: '[TEST] Financial Poll',
      options: ['A', 'B']
    }, financialOfficerToken);
    assert(res.status === 403, 'T2.3: Financial Officer gets 403 when creating poll', `Got status ${res.status}`);
  } catch (e) {
    assert(false, 'T2.3: Financial Officer poll creation forbidden', e.message);
  }

  // ── Test 7: Customer gets 403 on active polls endpoint ─────────
  try {
    const res = await apiCall('GET', '/api/polls/active', null, customerToken);
    assert(res.status === 403, 'T2.4: Customer gets 403 on GET /api/polls/active', `Got status ${res.status}`);
  } catch (e) {
    assert(false, 'T2.4: Customer gets 403 on active polls', e.message);
  }

  // ── Test 8: Customer gets 403 on vote endpoint ─────────────────
  if (testPollId) {
    try {
      const res = await apiCall('POST', `/api/polls/${testPollId}/vote`, { selectedOption: 'Option A' }, customerToken);
      assert(res.status === 403, 'T2.5: Customer gets 403 on POST /api/polls/:id/vote', `Got status ${res.status}`);
    } catch (e) {
      assert(false, 'T2.5: Customer gets 403 on vote endpoint', e.message);
    }
  }

  // ── Test 9: Internal user can retrieve active polls ────────────
  log('\n--- Test Group 3: Voting & Active Polls (SCRUM-191) ---');
  try {
    const res = await apiCall('GET', '/api/polls/active', null, employeeToken);
    assert(res.status === 200, 'T3.1: Employee can retrieve active polls (200)', `Got status ${res.status}`);
    assert(Array.isArray(res.body), 'T3.2: Active polls response is an array');
  } catch (e) {
    assert(false, 'T3.1: Active polls retrieval', e.message);
  }

  // ── Test 10: Vote submission ────────────────────────────────────
  let voteSucceeded = false;
  if (testPollId) {
    try {
      const res = await apiCall('POST', `/api/polls/${testPollId}/vote`,
        { selectedOption: 'Option A' }, employeeToken);
      assert(res.status === 201, 'T3.3: Employee can vote on a poll (201)', `Got status ${res.status}`);
      assert(res.body && res.body.voteId, 'T3.4: Vote response includes voteId');
      assert(res.body && Array.isArray(res.body.voteCounts), 'T3.5: Vote response includes updated voteCounts');
      voteSucceeded = res.status === 201;
    } catch (e) {
      assert(false, 'T3.3: Vote submission', e.message);
    }
  }

  // ── Test 11: DUPLICATE VOTE → 409 Conflict (SCRUM-194) ─────────
  log('\n--- Test Group 4: Duplicate Vote Prevention (SCRUM-194) ---');
  if (testPollId && voteSucceeded) {
    try {
      const res = await apiCall('POST', `/api/polls/${testPollId}/vote`,
        { selectedOption: 'Option B' }, employeeToken);
      assert(res.status === 409, 'T4.1: Duplicate vote returns 409 Conflict ← SCRUM-194 ✓', `Got status ${res.status}`);
      assert(
        res.body && res.body.code === 'DUPLICATE_VOTE',
        'T4.2: 409 response body has code "DUPLICATE_VOTE"',
        `Got code: ${res.body && res.body.code}`
      );
      log(`     Duplicate vote error message: "${res.body && res.body.error}"`, 'INFO');
    } catch (e) {
      assert(false, 'T4.1: Duplicate vote → 409', e.message);
    }
  } else {
    log('T4.1-T4.2: Skipped (initial vote did not succeed or no poll created)', 'WARN');
  }

  // ── Test 12: Vote aggregation ───────────────────────────────────
  log('\n--- Test Group 5: Vote Aggregation (SCRUM-193) ---');
  if (testPollId) {
    try {
      const res = await apiCall('GET', `/api/polls/${testPollId}/results`, null, adminToken);
      assert(res.status === 200, 'T5.1: GET /api/polls/:id/results returns 200', `Got status ${res.status}`);
      assert(res.body && res.body.totalVotes !== undefined, 'T5.2: Results include totalVotes');
      assert(res.body && Array.isArray(res.body.results), 'T5.3: Results include results array');

      if (res.body && Array.isArray(res.body.results)) {
        const optionA = res.body.results.find(r => r.option === 'Option A');
        assert(optionA && optionA.count > 0, 'T5.4: Option A has at least 1 vote after submission', `count=${optionA && optionA.count}`);
        assert(optionA && typeof optionA.percentage === 'number', 'T5.5: Vote result includes percentage');
        log(`     Aggregated results: ${JSON.stringify(res.body.results)}`, 'INFO');
      }
    } catch (e) {
      assert(false, 'T5.1: Vote aggregation via API', e.message);
    }
  }

  // ── Test 13: Invalid option rejected ────────────────────────────
  if (testPollId) {
    try {
      // Use a different user (admin) who hasn't voted yet
      const res = await apiCall('POST', `/api/polls/${testPollId}/vote`,
        { selectedOption: 'THIS_OPTION_DOES_NOT_EXIST' }, adminToken);
      assert(res.status === 400, 'T5.6: Invalid option is rejected with 400', `Got status ${res.status}`);
    } catch (e) {
      assert(false, 'T5.6: Invalid option rejected', e.message);
    }
  }

  // ── Test 14: Missing selectedOption ─────────────────────────────
  if (testPollId) {
    try {
      const res = await apiCall('POST', `/api/polls/${testPollId}/vote`, {}, adminToken);
      assert(res.status === 400, 'T5.7: Missing selectedOption returns 400', `Got status ${res.status}`);
    } catch (e) {
      assert(false, 'T5.7: Missing selectedOption', e.message);
    }
  }

  // ── Test 15: Create confidential poll ───────────────────────────
  log('\n--- Test Group 6: Confidential Voting & Reporting ---');
  let confidentialPollId = null;
  try {
    const res = await apiCall('POST', '/api/polls', {
      title: '[TEST] Confidential Governance Vote',
      description: 'Testing anonymous voting flow',
      options: ['Yes', 'No', 'Abstain'],
      isConfidential: true
    }, adminToken);
    assert(res.status === 201, 'T6.1: Admin can create a confidential poll');
    if (res.status === 201 && res.body.poll && res.body.poll.id) {
      confidentialPollId = res.body.poll.id;
      createdPollIds.push(confidentialPollId);
    }
  } catch (e) {
    assert(false, 'T6.1: Confidential poll creation', e.message);
  }

  // ── Test 16: Vote on confidential poll ──────────────────────────
  if (confidentialPollId) {
    try {
      const res = await apiCall('POST', `/api/polls/${confidentialPollId}/vote`,
        { selectedOption: 'Yes' }, employeeToken);
      assert(res.status === 201, 'T6.2: Employee can vote on confidential poll');
    } catch (e) {
      assert(false, 'T6.2: Vote on confidential poll', e.message);
    }
  }

  // ── Test 17: Verify userVote is masked in active polls ───────────
  if (confidentialPollId) {
    try {
      const res = await apiCall('GET', '/api/polls/active', null, employeeToken);
      const pollObj = res.body.find(p => p.id === confidentialPollId);
      assert(pollObj && pollObj.userVote === 'confidential_voted', 'T6.3: Active polls returns "confidential_voted" for voter choice mask');
    } catch (e) {
      assert(false, 'T6.3: Mask voter choice in active polls', e.message);
    }
  }

  // ── Test 18: Download CSV report for public poll ────────────────
  if (testPollId) {
    try {
      const res = await apiCall('GET', `/api/polls/${testPollId}/report/csv`, null, adminToken);
      assert(res.status === 200, 'T6.4: Admin can retrieve public CSV report');
      assert(typeof res.body === 'string' && res.body.includes('Option A') && res.body.includes('Option'), 'T6.5: Public report includes option choice details');
    } catch (e) {
      assert(false, 'T6.4: Public CSV report download', e.message);
    }
  }

  // ── Test 19: Download CSV report for confidential poll ──────────
  if (confidentialPollId) {
    try {
      const res = await apiCall('GET', `/api/polls/${confidentialPollId}/report/csv`, null, adminToken);
      assert(res.status === 200, 'T6.6: Admin can retrieve confidential CSV report');
      assert(typeof res.body === 'string' && res.body.includes('Confidential') && !res.body.includes('Yes,"Yes'), 'T6.7: Confidential report masks option choice as "Confidential"');
    } catch (e) {
      assert(false, 'T6.6: Confidential CSV report download', e.message);
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────
  log('\n--- Cleanup ---');
  try {
    await cleanupTestPolls();
    log(`Cleaned up ${createdPollIds.length} test poll(s)`, 'INFO');
  } catch (e) {
    log('Cleanup failed (non-fatal): ' + e.message, 'WARN');
  }

  // ── Summary ────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n' + '═'.repeat(60));
  console.log(`  Test Results: ${passed}/${total} passed`);
  if (failed > 0) {
    console.log(`  ❌ ${failed} test(s) FAILED`);
  } else {
    console.log('  ✅ ALL TESTS PASSED');
  }
  console.log('═'.repeat(60));

  return failed === 0;
}

if (require.main === module) {
  runTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
      console.error('[Fatal] Test runner error:', err);
      process.exit(1);
    });
}

module.exports = runTests;
