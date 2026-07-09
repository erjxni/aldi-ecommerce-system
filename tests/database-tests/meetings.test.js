const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'aldi_secret_jwt_key_2026';

async function testMeetings() {
  console.log('[Test] Starting Meetings Management & Minutes Editor integration tests...');
  let passed = 0;
  let failed = 0;
  const createdMeetingIds = [];
  const createdDocIds = [];

  try {
    // 1. Start Express server if not already running
    const { server } = require('../../backend/server.js');
    if (!server.listening) {
      await new Promise((resolve, reject) => {
        server.listen(3001, () => {
          console.log('[Test] Server started on port 3001');
          resolve();
        });
        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.log('[Test] Port 3001 already in use, assuming server is running.');
            resolve();
          } else {
            reject(err);
          }
        });
      });
    } else {
      console.log('[Test] Server already listening.');
    }

    // 2. Initialize Firebase connection to verify DB write
    let serviceAccount;
    if (process.env.ALDI_SQL_CONNECT_API_KEY) {
      serviceAccount = JSON.parse(process.env.ALDI_SQL_CONNECT_API_KEY);
    } else {
      const keyPath = path.join(__dirname, '../../aldi-ecommerce-managemen-b40e8-firebase-adminsdk-fbsvc-b76cea1fbf.json');
      serviceAccount = require(keyPath);
    }

    const app = initializeApp({
      credential: cert(serviceAccount)
    }, 'test-meetings-app');

    const sqlConnect = getDataConnect({
      serviceId: 'aldi-ecommerce-managemen-b40e8-service',
      location: 'europe-west3'
    }, app);

    // Get a real admin user ID from the database
    const userQuery = `
      query GetAdminUser {
        users(where: { email: { eq: "admin@aldi-mock.com" } }) {
          id
        }
      }
    `;
    const userResult = await sqlConnect.executeGraphqlRead(userQuery);
    const mockUserId = userResult.data.users[0]?.id || '9a78ea87-2b20-4741-a9d6-2454cd999c18';

    // Generate JWT tokens
    const adminToken = jwt.sign(
      { id: mockUserId, email: 'admin@aldi-mock.com', first_name: 'Admin', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const employeeToken = jwt.sign(
      { id: '33333333-3333-3333-3333-333333333333', email: 'employee@aldi-mock.com', first_name: 'Employee', role: 'employee' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const customerToken = jwt.sign(
      { id: '11111111-1111-1111-1111-111111111111', email: 'customer@aldi-mock.com', first_name: 'Customer', role: 'customer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // ====================================================
    // TEST 1: Customer gets 403 Forbidden on Meetings API
    // ====================================================
    console.log('\n[Test 1] Customer attempts to access meeting API endpoints...');
    try {
      // Test GET
      const getRes = await fetch('http://localhost:3001/api/meetings', {
        headers: { 'Cookie': `aldi_jwt=${customerToken}` }
      });
      if (getRes.status !== 403) {
        throw new Error(`Expected GET to be 403, got ${getRes.status}`);
      }

      // Test POST
      const postRes = await fetch('http://localhost:3001/api/meetings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `aldi_jwt=${customerToken}`
        },
        body: JSON.stringify({ title: 'Hack', date: new Date().toISOString() })
      });
      if (postRes.status !== 403) {
        throw new Error(`Expected POST to be 403, got ${postRes.status}`);
      }

      console.log('[Test 1] ✅ PASSED — Standard customer blocked with 403 Forbidden');
      passed++;
    } catch (err) {
      console.error(`[Test 1] ❌ FAILED — ${err.message}`);
      failed++;
    }

    // ====================================================
    // TEST 2: Admin can schedule a meeting
    // ====================================================
    console.log('\n[Test 2] Admin schedules a meeting...');
    let testMeetingId1 = null;
    let testMeetingId2 = null; // We'll schedule two to test chronological sorting

    try {
      // Meeting 1: Tomorrow
      const date1 = new Date();
      date1.setDate(date1.getDate() + 1);

      const res1 = await fetch('http://localhost:3001/api/meetings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `aldi_jwt=${adminToken}`
        },
        body: JSON.stringify({
          title: '[Test] Meeting Tomorrow',
          description: 'A sprint review for tomorrow',
          date: date1.toISOString()
        })
      });

      const body1 = await res1.json();
      if (res1.status !== 201) {
        throw new Error(`Expected status 201, got ${res1.status}: ${JSON.stringify(body1)}`);
      }
      if (!body1.id || body1.title !== '[Test] Meeting Tomorrow') {
        throw new Error(`Malformed response body: ${JSON.stringify(body1)}`);
      }
      testMeetingId1 = body1.id;
      createdMeetingIds.push(testMeetingId1);

      // Meeting 2: In 3 days (scheduled slightly earlier but date is further out)
      const date2 = new Date();
      date2.setDate(date2.getDate() + 3);

      const res2 = await fetch('http://localhost:3001/api/meetings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `aldi_jwt=${adminToken}`
        },
        body: JSON.stringify({
          title: '[Test] Meeting Later',
          description: 'A retrospective for later',
          date: date2.toISOString()
        })
      });
      const body2 = await res2.json();
      testMeetingId2 = body2.id;
      createdMeetingIds.push(testMeetingId2);

      console.log(`[Test 2] ✅ PASSED — Scheduled two meetings successfully. IDs: ${testMeetingId1}, ${testMeetingId2}`);
      passed++;
    } catch (err) {
      console.error(`[Test 2] ❌ FAILED — ${err.message}`);
      failed++;
    }

    // ====================================================
    // TEST 3: Staff can retrieve meetings chronologically
    // ====================================================
    console.log('\n[Test 3] Logged-in staff retrieves meeting list...');
    try {
      const res = await fetch('http://localhost:3001/api/meetings', {
        headers: { 'Cookie': `aldi_jwt=${employeeToken}` }
      });
      if (res.status !== 200) {
        throw new Error(`Expected status 200, got ${res.status}`);
      }
      const meetings = await res.json();
      if (!Array.isArray(meetings) || meetings.length < 2) {
        throw new Error(`Expected array of meetings, got: ${JSON.stringify(meetings)}`);
      }

      // Verify that meeting tomorrow is earlier in array than meeting in 3 days
      const index1 = meetings.findIndex(m => m.id === testMeetingId1);
      const index2 = meetings.findIndex(m => m.id === testMeetingId2);

      if (index1 === -1 || index2 === -1) {
        throw new Error('Scheduled test meetings not found in list');
      }
      if (index1 > index2) {
        throw new Error('Meetings are not sorted chronologically: Meeting tomorrow should come before Meeting in 3 days.');
      }

      console.log('[Test 3] ✅ PASSED — Meetings listed successfully and sorted chronologically');
      passed++;
    } catch (err) {
      console.error(`[Test 3] ❌ FAILED — ${err.message}`);
      failed++;
    }

    // ====================================================
    // TEST 4: Admin can link document to past meeting
    // ====================================================
    console.log('\n[Test 4] Admin links a document to a past meeting...');
    let tempDocId = null;
    try {
      // 4a. Create a temp document metadata row using SQL query run
      tempDocId = crypto.randomUUID();
      const insertDocQuery = `
        mutation CreateTempDoc {
          _execute(sql: "INSERT INTO \\"document\\" (id, title, category, file_url, created_at) VALUES ('${tempDocId}', '[Test] Temp Minutes', 'Governance', 'http://temp.url', CURRENT_TIMESTAMP)")
        }
      `;
      await sqlConnect.executeGraphql(insertDocQuery);
      createdDocIds.push(tempDocId);

      // 4b. Call PATCH meeting link
      const res = await fetch(`http://localhost:3001/api/meetings/${testMeetingId1}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `aldi_jwt=${adminToken}`
        },
        body: JSON.stringify({ minutesDocumentId: tempDocId })
      });
      if (res.status !== 200) {
        throw new Error(`Expected status 200, got ${res.status}`);
      }

      // 4c. Verify in database
      const selectQuery = `
        query VerifyLink {
          _select(sql: "SELECT minutes_document_id FROM \\"meeting\\" WHERE id = '${testMeetingId1}'")
        }
      `;
      const selectRes = await sqlConnect.executeGraphqlRead(selectQuery);
      const dbLink = selectRes.data._select[0]?.minutes_document_id;
      const normalizedDbLink = dbLink ? dbLink.replace(/-/g, '') : '';
      const normalizedTempDoc = tempDocId ? tempDocId.replace(/-/g, '') : '';
      if (normalizedDbLink !== normalizedTempDoc) {
        throw new Error(`Link mismatch in database: expected ${tempDocId}, got ${dbLink}`);
      }

      console.log('[Test 4] ✅ PASSED — Meeting linked to document successfully');
      passed++;
    } catch (err) {
      console.error(`[Test 4] ❌ FAILED — ${err.message}`);
      failed++;
    }

    // ====================================================
    // TEST 5: Interactive Minutes Editor saves and updates
    // ====================================================
    console.log('\n[Test 5] Test Write/Update Minutes content text editor flow...');
    try {
      // 5a. Create minutes text content
      const contentText = 'Discussion: Sprint Goals are met. Action items: Deploy to staging.';
      const res1 = await fetch(`http://localhost:3001/api/meetings/${testMeetingId2}/minutes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `aldi_jwt=${adminToken}`
        },
        body: JSON.stringify({ content: contentText })
      });

      const body1 = await res1.json();
      if (res1.status !== 201) {
        throw new Error(`Expected status 201, got ${res1.status}: ${JSON.stringify(body1)}`);
      }
      const linkedDocId = body1.documentId;
      if (!linkedDocId) throw new Error('Response did not return documentId');
      createdDocIds.push(linkedDocId);

      // Verify meeting 2 is now linked to this document
      const verifyQuery1 = `
        query VerifyLink2 {
          _select(sql: "SELECT minutes_document_id FROM \\"meeting\\" WHERE id = '${testMeetingId2}'")
        }
      `;
      const verifyRes1 = await sqlConnect.executeGraphqlRead(verifyQuery1);
      const dbLink2 = verifyRes1.data._select[0]?.minutes_document_id;
      const normalizedDbLink2 = dbLink2 ? dbLink2.replace(/-/g, '') : '';
      const normalizedLinkedDoc = linkedDocId ? linkedDocId.replace(/-/g, '') : '';
      if (normalizedDbLink2 !== normalizedLinkedDoc) {
        throw new Error(`Meeting minutes link mismatch: expected ${linkedDocId}, got ${dbLink2}`);
      }

      // Download file to verify content
      const downloadRes1 = await fetch(`http://localhost:3001/api/documents/download/${linkedDocId}`, {
        headers: { 'Cookie': `aldi_jwt=${adminToken}` }
      });
      const downloadedText1 = await downloadRes1.text();
      if (downloadedText1 !== contentText) {
        throw new Error(`Downloaded content mismatch: expected "${contentText}", got "${downloadedText1}"`);
      }

      // 5b. Update/overwrite the minutes
      const updatedText = 'Updated Discussion: Sprint Goals fully met. Released to production.';
      const res2 = await fetch(`http://localhost:3001/api/meetings/${testMeetingId2}/minutes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `aldi_jwt=${adminToken}`
        },
        body: JSON.stringify({ content: updatedText })
      });

      if (res2.status !== 200) {
        throw new Error(`Expected status 200 for update, got ${res2.status}`);
      }

      // Download file to verify updated content
      const downloadRes2 = await fetch(`http://localhost:3001/api/documents/download/${linkedDocId}`, {
        headers: { 'Cookie': `aldi_jwt=${adminToken}` }
      });
      const downloadedText2 = await downloadRes2.text();
      if (downloadedText2 !== updatedText) {
        throw new Error(`Downloaded updated content mismatch: expected "${updatedText}", got "${downloadedText2}"`);
      }

      console.log('[Test 5] ✅ PASSED — Minutes successfully written, linked, and overwritten in storage');
      passed++;
    } catch (err) {
      console.error(`[Test 5] ❌ FAILED — ${err.message}`);
      failed++;
    }

    // ====================================================
    // CLEANUP
    // ====================================================
    console.log('\n[Test] Cleaning up test data...');
    // Delete test meetings
    for (const mId of createdMeetingIds) {
      try {
        await sqlConnect.executeGraphql(`
          mutation DeleteMeeting {
            _execute(sql: "DELETE FROM \\"meeting\\" WHERE id = '${mId}'")
          }
        `);
      } catch (e) {
        console.warn(`[Test] Cleanup warning for meeting ${mId}:`, e.message);
      }
    }

    // Delete test documents
    for (const dId of createdDocIds) {
      try {
        // Try deleting via API to delete from Firebase Storage as well
        const deleteRes = await fetch(`http://localhost:3001/api/documents/${dId}`, {
          method: 'DELETE',
          headers: { 'Cookie': `aldi_jwt=${adminToken}` }
        });
        if (deleteRes.status !== 200) {
          // Fallback direct sql delete
          await sqlConnect.executeGraphql(`
            mutation DeleteDoc {
              _execute(sql: "DELETE FROM \\"document\\" WHERE id = '${dId}'")
            }
          `);
        }
      } catch (e) {
        console.warn(`[Test] Cleanup warning for document ${dId}:`, e.message);
      }
    }
    console.log('[Test] Cleanup complete');

  } catch (error) {
    console.error('[Test] Setup failed:', error.message);
    failed++;
  }

  console.log(`\n[Meetings Tests] ${passed} passed, ${failed} failed`);
  return failed === 0;
}

if (require.main === module) {
  testMeetings().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = testMeetings;
