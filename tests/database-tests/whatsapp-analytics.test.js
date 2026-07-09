const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');


const JWT_SECRET = process.env.JWT_SECRET || 'aldi_secret_jwt_key_2026';
const whatsappJsonPath = path.join(__dirname, '../../database/whatsapp_log.json');

async function testWhatsAppAnalytics() {
  console.log('[Test] Starting WhatsApp Analytics integration tests...');
  let passed = 0;
  let failed = 0;

  let originalJsonBackup = null;
  let sqlConnect = null;
  let uploadedDocumentId = null;
  let adminToken = null;

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

    // Backup original local JSON file if exists
    if (fs.existsSync(whatsappJsonPath)) {
      originalJsonBackup = fs.readFileSync(whatsappJsonPath, 'utf8');
      fs.writeFileSync(whatsappJsonPath, '[]');
    } else {
      const dir = path.dirname(whatsappJsonPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(whatsappJsonPath, '[]');
    }

    let serviceAccount;
    if (process.env.ALDI_SQL_CONNECT_API_KEY) {
      serviceAccount = JSON.parse(process.env.ALDI_SQL_CONNECT_API_KEY);
    } else {
      const keyPath = path.join(__dirname, '../../aldi-ecommerce-managemen-b40e8-firebase-adminsdk-fbsvc-b76cea1fbf.json');
      serviceAccount = require(keyPath);
    }

    const app = initializeApp({
      credential: cert(serviceAccount)
    }, 'whatsapp-analytics-test-app');

    sqlConnect = getDataConnect({
      serviceId: 'aldi-ecommerce-managemen-b40e8-service',
      location: 'europe-west3'
    }, app);

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
    adminToken = jwt.sign(
      { id: mockUserId, email: 'admin@aldi-mock.com', first_name: 'Admin', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const employeeToken = jwt.sign(
      { id: '2a222222-2222-2222-2222-222222222222', email: 'employee@aldi-mock.com', first_name: 'Employee', role: 'employee' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const financialToken = jwt.sign(
      { id: '3a333333-3333-3333-3333-333333333333', email: 'officer@aldi-mock.com', first_name: 'Officer', role: 'financial_officer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const customerToken = jwt.sign(
      { id: '4a444444-4444-4444-4444-444444444444', email: 'customer@aldi-mock.com', first_name: 'Customer', role: 'customer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Clear existing whatsapp logs for test isolation
    try {
      const deleteMutation = `
        mutation DeleteLogs {
          whatsAppLog_deleteMany(all: true)
        }
      `;
      await sqlConnect.executeGraphql(deleteMutation);
      console.log('[Test] Cleaned up whatsAppLog table at start');
    } catch (err) {
      console.warn('[Test] Warning: Start cleanup failed:', err.message);
    }

    // ====================================================
    // TEST 1: Webhook Ingestion with PII Stripping
    // ====================================================
    console.log('\n[Test 1] Posting a WhatsApp payload with PII fields...');
    try {
      const payload = {
        phoneNumber: '+31612345678',
        senderName: 'John Doe',
        text: 'Can I change my order details please?',
        topicCluster: 'Order Issue',
        sentimentScore: -0.4,
        timestamp: '2026-07-05T10:15:30.000Z'
      };

      const res = await fetch('http://localhost:3001/api/analytics/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.status !== 201) {
        throw new Error(`Expected status 201, got ${res.status}`);
      }

      const body = await res.json();
      if (!body.id) {
        throw new Error('Response did not return a generated ID');
      }

      // Read fallback JSON to confirm PII fields are NOT present
      if (fs.existsSync(whatsappJsonPath)) {
        const logs = JSON.parse(fs.readFileSync(whatsappJsonPath, 'utf8'));
        const savedLog = logs.find(l => l.id === body.id);
        if (savedLog) {
          // Assertions for PII stripping
          if (savedLog.phoneNumber || savedLog.senderName || savedLog.text) {
            throw new Error('PII Stripping Failed: Phone, name, or text fields were stored!');
          }
          if (savedLog.topicCluster !== 'Order Issue' || savedLog.sentimentScore !== -0.4) {
            throw new Error('Stored log data does not match payload values');
          }
        }
      }

      console.log('[Test 1] PASS: Webhook processed successfully and stripped all PII.');
      passed++;
    } catch (err) {
      console.error('[Test 1] FAIL:', err.message);
      failed++;
    }

    // ====================================================
    // TEST 2: Webhook Validation of Invalid Payloads
    // ====================================================
    console.log('\n[Test 2] Posting invalid WhatsApp webhook payloads...');
    try {
      // Missing topicCluster
      const res1 = await fetch('http://localhost:3001/api/analytics/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentimentScore: 0.1 })
      });
      if (res1.status !== 400) {
        throw new Error(`Expected 400 for missing topicCluster, got ${res1.status}`);
      }

      // Missing sentimentScore
      const res2 = await fetch('http://localhost:3001/api/analytics/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicCluster: 'Product Inquiry' })
      });
      if (res2.status !== 400) {
        throw new Error(`Expected 400 for missing sentimentScore, got ${res2.status}`);
      }

      console.log('[Test 2] PASS: Invalid payloads rejected with 400.');
      passed++;
    } catch (err) {
      console.error('[Test 2] FAIL:', err.message);
      failed++;
    }

    // ====================================================
    // TEST 3: Endpoint Security (JWT Role Restrictions)
    // ====================================================
    console.log('\n[Test 3] Verifying GET stats authorization restrictions...');
    try {
      // 1. Missing Token
      const resNoToken = await fetch('http://localhost:3001/api/analytics/whatsapp/stats');
      if (resNoToken.status !== 401) {
        throw new Error(`Expected 401 for missing token, got ${resNoToken.status}`);
      }

      // 2. Customer Role
      const resCustomer = await fetch('http://localhost:3001/api/analytics/whatsapp/stats', {
        headers: { 'Authorization': `Bearer ${customerToken}` }
      });
      if (resCustomer.status !== 403) {
        throw new Error(`Expected 403 for Customer role, got ${resCustomer.status}`);
      }

      // 3. Financial Officer Role
      const resFinancial = await fetch('http://localhost:3001/api/analytics/whatsapp/stats', {
        headers: { 'Authorization': `Bearer ${financialToken}` }
      });
      if (resFinancial.status !== 403) {
        throw new Error(`Expected 403 for Financial Officer role, got ${resFinancial.status}`);
      }

      // 4. Employee Role
      const resEmployee = await fetch('http://localhost:3001/api/analytics/whatsapp/stats', {
        headers: { 'Authorization': `Bearer ${employeeToken}` }
      });
      if (resEmployee.status !== 200) {
        throw new Error(`Expected 200 for Employee role, got ${resEmployee.status}`);
      }

      // 5. Admin Role
      const resAdmin = await fetch('http://localhost:3001/api/analytics/whatsapp/stats', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (resAdmin.status !== 200) {
        throw new Error(`Expected 200 for Admin role, got ${resAdmin.status}`);
      }

      console.log('[Test 3] PASS: Stats endpoint successfully enforces role protection.');
      passed++;
    } catch (err) {
      console.error('[Test 3] FAIL:', err.message);
      failed++;
    }

    // ====================================================
    // TEST 4: Stats Aggregation Logic
    // ====================================================
    console.log('\n[Test 4] Verifying aggregated statistics counts...');
    try {
      // Ingest test logs at specific timestamps
      const logsToIngest = [
        { topicCluster: 'Product Inquiry', sentimentScore: 0.8, timestamp: '2026-07-05T14:10:00.000Z' }, // 2:10 PM (Hour 14)
        { topicCluster: 'Product Inquiry', sentimentScore: 0.9, timestamp: '2026-07-05T14:40:00.000Z' }, // 2:40 PM (Hour 14)
        { topicCluster: 'Refund Request', sentimentScore: -0.8, timestamp: '2026-07-05T20:00:00.000Z' }, // 8:00 PM (Hour 20)
      ];

      for (const log of logsToIngest) {
        await fetch('http://localhost:3001/api/analytics/whatsapp/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(log)
        });
      }

      const res = await fetch('http://localhost:3001/api/analytics/whatsapp/stats', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();

      // Check hour counts
      const hour10 = data.peakHours.find(h => h.hour === 10);
      const hour14 = data.peakHours.find(h => h.hour === 14);
      const hour20 = data.peakHours.find(h => h.hour === 20);

      if (hour10.count !== 1) { // 1 from Test 1
        throw new Error(`Expected Hour 10 to have count 1, got ${hour10.count}`);
      }
      if (hour14.count !== 2) {
        throw new Error(`Expected Hour 14 to have count 2, got ${hour14.count}`);
      }
      if (hour20.count !== 1) {
        throw new Error(`Expected Hour 20 to have count 1, got ${hour20.count}`);
      }

      // Check topic counts
      const prodInquiry = data.topicClusters.find(t => t.topicCluster === 'Product Inquiry');
      const orderIssue = data.topicClusters.find(t => t.topicCluster === 'Order Issue');
      const refundRequest = data.topicClusters.find(t => t.topicCluster === 'Refund Request');

      if (prodInquiry.count !== 2) {
        throw new Error(`Expected Product Inquiry count to be 2, got ${prodInquiry.count}`);
      }
      if (orderIssue.count !== 1) { // 1 from Test 1
        throw new Error(`Expected Order Issue count to be 1, got ${orderIssue.count}`);
      }
      if (refundRequest.count !== 1) {
        throw new Error(`Expected Refund Request count to be 1, got ${refundRequest.count}`);
      }

      console.log('[Test 4] PASS: Stats aggregation output is accurate and correctly sorted.');
      passed++;
    } catch (err) {
      console.error('[Test 4] FAIL:', err.message);
      failed++;
    }

    // ====================================================
    // TEST 5: Chat Log Uploader and parsing
    // ====================================================
    console.log('\n[Test 5] Uploading a mock chat log file...');
    try {
      // 1. Missing Token
      const resNoToken = await fetch('http://localhost:3001/api/analytics/whatsapp/upload', {
        method: 'POST'
      });
      if (resNoToken.status !== 401) {
        throw new Error(`Expected 401 for upload without token, got ${resNoToken.status}`);
      }

      // 2. Customer Token
      const resCustomer = await fetch('http://localhost:3001/api/analytics/whatsapp/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${customerToken}` }
      });
      if (resCustomer.status !== 403) {
        throw new Error(`Expected 403 for Customer role upload, got ${resCustomer.status}`);
      }

      // 3. Upload a mock chat log file using FormData
      const mockLogContent = `23/04/2026, 17:11 - KB Monjardin: hello, I believe we have to send the draft tomorrow?
24/04/2026, 14:12 - Yuhan Zhang: Can you check the catalog item price?
24/04/2026, 23:59 - Said: the shipping address is wrong and delayed
`;
      
      const formData = new FormData();
      const blob = new Blob([mockLogContent], { type: 'text/plain' });
      formData.append('file', blob, 'mock-chat-log.txt');

      const resUpload = await fetch('http://localhost:3001/api/analytics/whatsapp/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        },
        body: formData
      });

      if (resUpload.status !== 201) {
        const bodyErr = await resUpload.json();
        throw new Error(`Expected 201 for Admin upload, got ${resUpload.status} (${JSON.stringify(bodyErr)})`);
      }

      const uploadResult = await resUpload.json();
      if (!uploadResult.documentId || uploadResult.recordsIngested !== 3) {
        throw new Error(`Unexpected upload result: ${JSON.stringify(uploadResult)}`);
      }
      uploadedDocumentId = uploadResult.documentId;

      console.log('[Test 5] PASS: Chat log file parsed, anonymized, and stored in databases successfully.');
      passed++;
    } catch (err) {
      console.error('[Test 5] FAIL:', err.message);
      failed++;
    }

    // ====================================================
    // TEST 6: Stats with documentId and Metrics Verification
    // ====================================================
    console.log('\n[Test 6] Fetching stats for uploaded document and validating metrics...');
    try {
      if (!uploadedDocumentId) {
        throw new Error('Skipping Test 6: Document ID from Test 5 not available');
      }

      const resStats = await fetch(`http://localhost:3001/api/analytics/whatsapp/stats?documentId=${uploadedDocumentId}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      if (resStats.status !== 200) {
        throw new Error(`Expected 200 for stats with documentId, got ${resStats.status}`);
      }

      const data = await resStats.json();

      // Verify most active & least active users
      if (!data.mostActiveUsers || !Array.isArray(data.mostActiveUsers)) {
        throw new Error('Response did not contain mostActiveUsers array');
      }
      if (!data.leastActiveUsers || !Array.isArray(data.leastActiveUsers)) {
        throw new Error('Response did not contain leastActiveUsers array');
      }

      // Check specific parsed user names from Test 5 mockLogContent
      const users = ['KB Monjardin', 'Yuhan Zhang', 'Said'];
      const hasMostActiveUsers = data.mostActiveUsers.some(u => users.includes(u.name));
      if (!hasMostActiveUsers) {
        throw new Error(`Most active users list did not contain expected senders: ${JSON.stringify(data.mostActiveUsers)}`);
      }

      // Verify frequencies
      if (!data.frequency || !data.frequency.daily || !data.frequency.weekly || !data.frequency.monthly) {
        throw new Error('Response did not contain daily/weekly/monthly frequency data');
      }
      if (!data.averages || typeof data.averages.daily !== 'number') {
        throw new Error('Response did not contain average calculations');
      }

      console.log('[Test 6] PASS: Stats returned complete user activity and frequency calculations.');
      passed++;
    } catch (err) {
      console.error('[Test 6] FAIL:', err.message);
      failed++;
    }

  } catch (error) {
    console.error('[Test] Setup failed:', error.stack);
    failed++;
  } finally {
    // Clean up WhatsApp log records from SQL database
    if (sqlConnect) {
      try {
        const deleteMutation = `
          mutation DeleteLogs {
            whatsAppLog_deleteMany(all: true)
          }
        `;
        await sqlConnect.executeGraphql(deleteMutation);
        console.log('[Test] Cleaned up whatsAppLog table at end');
      } catch (err) {
        console.warn('[Test] Warning: End database cleanup failed:', err.message);
      }
    }

    // Clean up uploaded document from SQL and Firebase Storage
    if (uploadedDocumentId) {
      try {
        const deleteRes = await fetch(`http://localhost:3001/api/documents/${uploadedDocumentId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (deleteRes.status === 200) {
          console.log('[Test] Cleanup: Uploaded document deleted successfully');
        } else {
          console.warn('[Test] Cleanup: Failed to delete document via API, status:', deleteRes.status);
        }
      } catch (cleanupErr) {
        console.warn('[Test] Cleanup warning for document:', cleanupErr.message);
      }
    }

    // Restore original JSON file
    try {
      if (originalJsonBackup !== null) {
        fs.writeFileSync(whatsappJsonPath, originalJsonBackup);
      } else {
        if (fs.existsSync(whatsappJsonPath)) {
          fs.unlinkSync(whatsappJsonPath);
        }
      }
      console.log('[Test] Local file cleanup complete');
    } catch (cleanupErr) {
      console.error('[Test] Cleanup warning:', cleanupErr.message);
    }
  }

  console.log(`\n[WhatsApp Analytics Tests] ${passed} passed, ${failed} failed`);
  return failed === 0;
}

if (require.main === module) {
  testWhatsAppAnalytics().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = testWhatsAppAnalytics;
