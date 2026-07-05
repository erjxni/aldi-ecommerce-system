const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const path = require('path');

const keyPath = path.join(__dirname, '../aldi-ecommerce-managemen-b40e8-firebase-adminsdk-fbsvc-b76cea1fbf.json');
const serviceAccount = require(keyPath);
const app = initializeApp({ credential: cert(serviceAccount) }, 'diag-app-' + Date.now());
const sqlConnect = getDataConnect({ serviceId: 'aldi-ecommerce-managemen-b40e8-service', location: 'europe-west3' }, app);

async function test() {
  // Test 1: SELECT
  try {
    const r = await sqlConnect.executeGraphqlRead('query T { _select(sql: "SELECT 1 AS n") }');
    console.log('[1] SELECT worked:', JSON.stringify(r.data));
  } catch(e) {
    console.error('[1] SELECT failed:', e.message);
    if (e.httpResponse && e.httpResponse.data) console.error('Details:', JSON.stringify(e.httpResponse.data));
  }

  // Test 2: INSERT-based _execute (as used for document table)
  try {
    const r = await sqlConnect.executeGraphql(`
      mutation T {
        _execute(sql: "SELECT 1")
      }
    `);
    console.log('[2] _execute SELECT 1 worked:', JSON.stringify(r.data));
  } catch(e) {
    console.error('[2] _execute failed:', e.message);
    if (e.httpResponse && e.httpResponse.data) console.error('Details:', JSON.stringify(e.httpResponse.data));
  }

  // Test 3: CREATE TABLE
  try {
    const r = await sqlConnect.executeGraphql(`
      mutation T {
        _execute(sql: "CREATE TABLE IF NOT EXISTS poll_test_tmp (col1 TEXT)")
      }
    `);
    console.log('[3] CREATE TABLE worked:', JSON.stringify(r.data));
    // Drop it
    await sqlConnect.executeGraphql(`mutation D { _execute(sql: "DROP TABLE IF EXISTS poll_test_tmp") }`);
    console.log('[3] DROP TABLE worked');
  } catch(e) {
    console.error('[3] CREATE TABLE failed:', e.message);
    if (e.httpResponse && e.httpResponse.data) console.error('Details:', JSON.stringify(e.httpResponse.data));
  }

  // Test 4: List existing tables
  try {
    const r = await sqlConnect.executeGraphqlRead(`
      query ListTables {
        _select(sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
      }
    `);
    console.log('[4] Tables in database:', JSON.stringify(r.data));
  } catch(e) {
    console.error('[4] List tables failed:', e.message);
  }
}

test().then(() => process.exit(0)).catch(e => { console.error('[Fatal]', e); process.exit(1); });
