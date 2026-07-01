const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const path = require('path');

async function inspectDb() {
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
    }, 'inspect-db-app');

    const sqlConnect = getDataConnect({
      serviceId: 'aldi-ecommerce-managemen-b40e8-service',
      location: 'europe-west3'
    }, app);

    const checkProductColumns = `
      query CheckColumns {
        _select(sql: "SELECT * FROM information_schema.columns WHERE table_name = 'product'")
      }
    `;

    const res1 = await sqlConnect.executeGraphqlRead(checkProductColumns);
    console.log('Columns in product table:');
    console.log(res1.data?._select?.map(c => c.column_name));

    const checkStockBatchColumns = `
      query CheckBatchColumns {
        _select(sql: "SELECT * FROM information_schema.columns WHERE table_name = 'stock_batch'")
      }
    `;

    const res2 = await sqlConnect.executeGraphqlRead(checkStockBatchColumns);
    console.log('Columns in stock_batch table:');
    console.log(res2.data?._select?.map(c => c.column_name));

    const selectProducts = `
      query SelectProducts {
        _select(sql: "SELECT id, name FROM \\"product\\" LIMIT 5")
      }
    `;
    const res3 = await sqlConnect.executeGraphqlRead(selectProducts);
    console.log('Sample products:');
    console.log(res3.data?._select);

  } catch (error) {
    console.error('Error:', error);
  }
}

inspectDb();
