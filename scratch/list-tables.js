const { sqlConnect } = require('../backend/db');

async function listTables() {
  try {
    const query = `
      query ListTables {
        _select(sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(query);
    console.log('Tables found in database:', JSON.stringify(result.data._select, null, 2));
  } catch (error) {
    console.error('Error listing tables:', error);
  }
  process.exit(0);
}

listTables();
