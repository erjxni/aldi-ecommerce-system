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
  }, 'inspect-doc-cols-app');

  const sqlConnect = getDataConnect({
    serviceId: 'aldi-ecommerce-managemen-b40e8-service',
    location: 'europe-west3'
  }, app);

  const query = `
    query GetMeetings {
      _select(sql: "SELECT m.id, m.title, m.description, m.date, m.minutes_document_id AS \\"minutesDocumentId\\", d.title AS \\"minutesDocumentTitle\\" FROM \\"meeting\\" m LEFT JOIN \\"document\\" d ON m.minutes_document_id = d.id ORDER BY m.date ASC")
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
