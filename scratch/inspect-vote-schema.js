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
  }, 'inspect-vote-app');

  const sqlConnect = getDataConnect({
    serviceId: 'aldi-ecommerce-managemen-b40e8-service',
    location: 'europe-west3'
  }, app);

  const query = `
    query GetCols {
      _select(sql: "SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'vote'")
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
