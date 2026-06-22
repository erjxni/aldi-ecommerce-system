const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const path = require('path');

async function testConnection() {
  console.log('[Test] Starting connection test...');
  try {
    const keyPath = path.join(__dirname, '../../aldi-ecommerce-managemen-b40e8-firebase-adminsdk-fbsvc-b76cea1fbf.json');
    const serviceAccount = require(keyPath);

    const app = initializeApp({
      credential: cert(serviceAccount)
    }, 'test-connection-app'); // Use a named app to avoid collision in shared runtimes

    const sqlConnect = getDataConnect({
      serviceId: 'aldi-ecommerce-managemen-b40e8-service',
      location: 'europe-west3'
    }, app);

    const inspectQuery = `
      query ListUsers {
        users(limit: 1) {
          email
        }
      }
    `;

    const result = await sqlConnect.executeGraphqlRead(inspectQuery);
    if (result && result.data && Array.isArray(result.data.users)) {
      console.log('[Test] Connection Success: Database query returned successfully.');
      return true;
    } else {
      throw new Error('Invalid query result structure');
    }
  } catch (error) {
    console.error('[Test] Connection Failed:', error.message);
    return false;
  }
}

// If run directly
if (require.main === module) {
  testConnection().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = testConnection;
