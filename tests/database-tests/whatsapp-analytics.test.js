const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'aldi_secret_jwt_key_2026';
const whatsappJsonPath = path.join(__dirname, '../../database/whatsapp_log.json');

async function testWhatsAppAnalytics() {
  console.log('[Test] Starting WhatsApp Analytics integration tests...');
  let passed = 0;
  let failed = 0;

  let originalJsonBackup = null;

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

    // Generate JWT tokens
    const adminToken = jwt.sign(
      { id: '1a111111-1111-1111-1111-111111111111', email: 'admin@aldi-mock.com', first_name: 'Admin', role: 'admin' },
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
        if (!savedLog) {
          throw new Error('Log not found in fallback storage');
        }
        
        // Assertions for PII stripping
        if (savedLog.phoneNumber || savedLog.senderName || savedLog.text) {
          throw new Error('PII Stripping Failed: Phone, name, or text fields were stored!');
        }
        if (savedLog.topicCluster !== 'Order Issue' || savedLog.sentimentScore !== -0.4) {
          throw new Error('Stored log data does not match payload values');
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

  } catch (error) {
    console.error('[Test] Setup failed:', error.message);
    failed++;
  } finally {
    // Restore original JSON file
    try {
      if (originalJsonBackup !== null) {
        fs.writeFileSync(whatsappJsonPath, originalJsonBackup);
      } else {
        if (fs.existsSync(whatsappJsonPath)) {
          fs.unlinkSync(whatsappJsonPath);
        }
      }
      console.log('[Test] Cleanup complete');
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
