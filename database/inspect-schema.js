const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const path = require('path');

async function inspectSchema() {
  try {
    let serviceAccount;
    if (process.env.ALDI_SQL_CONNECT_API_KEY) {
      serviceAccount = JSON.parse(process.env.ALDI_SQL_CONNECT_API_KEY);
    } else {
      const keyPath = path.join(__dirname, '../aldi-ecommerce-managemen-b40e8-firebase-adminsdk-fbsvc-b76cea1fbf.json');
      serviceAccount = require(keyPath);
    }

    const app = initializeApp({
      credential: cert(serviceAccount)
    }, 'inspect-app');

    const sqlConnect = getDataConnect({
      serviceId: 'aldi-ecommerce-managemen-b40e8-service',
      location: 'europe-west3'
    }, app);

    const query = `
      query Introspect {
        __schema {
          types {
            name
          }
        }
      }
    `;

    const result = await sqlConnect.executeGraphqlRead(query);
    console.log(JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

inspectSchema();
