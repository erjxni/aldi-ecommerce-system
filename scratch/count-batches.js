const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const path = require('path');

async function countBatches() {
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
    }, 'count-batches-app');

    const sqlConnect = getDataConnect({
      serviceId: 'aldi-ecommerce-managemen-b40e8-service',
      location: 'europe-west3'
    }, app);

    const query = `
      query GetBatchesCount {
        _select(sql: "SELECT count(*) AS count FROM \\"stock_batch\\"")
      }
    `;

    const res = await sqlConnect.executeGraphqlRead(query);
    console.log('Stock batches count:', res.data?._select);

    const query2 = `
      query GetBatches {
        _select(sql: "SELECT sb.*, p.name FROM \\"stock_batch\\" sb JOIN \\"product\\" p ON sb.product_id = p.id LIMIT 10")
      }
    `;
    const res2 = await sqlConnect.executeGraphqlRead(query2);
    console.log('Sample stock batches:', res2.data?._select);

  } catch (error) {
    console.error('Error:', error);
  }
}

countBatches();
