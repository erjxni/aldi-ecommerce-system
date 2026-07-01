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
    }, 'inspect-app-fields');

    const sqlConnect = getDataConnect({
      serviceId: 'aldi-ecommerce-managemen-b40e8-service',
      location: 'europe-west3'
    }, app);

    const query = `
      query Introspect {
        __type(name: "Product") {
          fields {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    `;

    const queryBatch = `
      query IntrospectBatch {
        __type(name: "StockBatch") {
          fields {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    `;

    const res1 = await sqlConnect.executeGraphqlRead(query);
    console.log('Product Type Fields:');
    console.log(JSON.stringify(res1.data?.__type?.fields, null, 2));

    const res2 = await sqlConnect.executeGraphqlRead(queryBatch);
    console.log('StockBatch Type Fields:');
    console.log(JSON.stringify(res2.data?.__type?.fields, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

inspectSchema();
