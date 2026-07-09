const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const path = require('path');

async function inspect() {
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
    query GetDocs {
      _select(sql: "SELECT id, title, category, file_url AS \\"fileUrl\\", created_at AS \\"createdAt\\" FROM \\"document\\"")
    }
  `;

  const result = await sqlConnect.executeGraphqlRead(query);
  console.log(JSON.stringify(result.data._select, null, 2));
}

inspect().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
