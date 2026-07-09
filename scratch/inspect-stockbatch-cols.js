const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const path = require('path');

async function run() {
  let serviceAccount;
  if (process.env.ALDI_SQL_CONNECT_API_KEY) {
    serviceAccount = JSON.parse(process.env.ALDI_SQL_CONNECT_API_KEY);
  } else {
    const keyPath = path.join(__dirname, '../aldi-ecommerce-managemen-b40e8-firebase-adminsdk-fbsvc-b76cea1fbf.json');
    serviceAccount = require(keyPath);
  }

  const app = initializeApp({
    credential: cert(serviceAccount)
  }, 'inspect-stock-app');

  const sqlConnect = getDataConnect({
    serviceId: 'aldi-ecommerce-managemen-b40e8-service',
    location: 'europe-west3'
  }, app);

  const query = `
    query GetBatches {
      _select(sql: "SELECT sb.id, sb.initial_quantity AS \\"initialQuantity\\", sb.piece_price AS \\"piecePrice\\", sb.received_at AS \\"receivedAt\\", p.name AS \\"productName\\" FROM \\"stock_batch\\" sb LEFT JOIN \\"product\\" p ON sb.product_id = p.id LIMIT 5")
    }
  `;

  try {
    const res = await sqlConnect.executeGraphqlRead(query);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

run();
