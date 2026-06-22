const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const path = require('path');

async function testOperations() {
  console.log('[Test] Starting database operations test...');
  try {
    let serviceAccount;
    if (process.env.ALDI_SQL_CONNECT_API_KEY) {
      serviceAccount = JSON.parse(process.env.ALDI_SQL_CONNECT_API_KEY);
    } else {
      try {
        const keyPath = path.join(__dirname, '../../aldi-ecommerce-managemen-b40e8-firebase-adminsdk-fbsvc-b76cea1fbf.json');
        serviceAccount = require(keyPath);
      } catch (err) {
        throw new Error('Firebase credentials not found. Please set the ALDI_SQL_CONNECT_API_KEY environment variable or verify the credential JSON file exists at the root.');
      }
    }

    const app = initializeApp({
      credential: cert(serviceAccount)
    }, 'test-operations-app');

    const sqlConnect = getDataConnect({
      serviceId: 'aldi-ecommerce-managemen-b40e8-service',
      location: 'europe-west3'
    }, app);

    const testEmail = 'test_suite_' + Math.floor(Math.random() * 100000) + '@aldi-test.com';

    // 1. Insert User
    console.log(`[Test] Inserting user: ${testEmail}...`);
    const insertMutation = `
      mutation InsertUser($email: String!, $passwordHash: String!, $role: String!, $displayName: String!) {
        user_insert(data: {
          email: $email,
          passwordHash: $passwordHash,
          role: $role,
          displayName: $displayName
        })
      }
    `;

    const insertResult = await sqlConnect.executeGraphql(insertMutation, {
      variables: {
        email: testEmail,
        passwordHash: 'testPass123',
        role: 'customer',
        displayName: 'Test Suite User'
      }
    });

    const userId = insertResult.data.user_insert.id;
    if (!userId) {
      throw new Error('Insert did not return a user ID');
    }
    console.log(`[Test] Insert OK, generated ID: ${userId}`);

    // 2. Select User
    console.log(`[Test] Querying user back by email...`);
    const selectQuery = `
      query GetUser($email: String!) {
        users(where: { email: { eq: $email } }) {
          id
          email
          role
          displayName
        }
      }
    `;

    const selectResult = await sqlConnect.executeGraphqlRead(selectQuery, {
      variables: { email: testEmail }
    });

    const user = selectResult.data.users[0];
    if (!user || user.email !== testEmail) {
      throw new Error('Could not retrieve user by email');
    }
    console.log('[Test] Query OK');

    // 3. Update User
    console.log('[Test] Updating user lastLogin timestamp...');
    const updateMutation = `
      mutation UpdateLastLogin($id: UUID!, $lastLogin: Timestamp!) {
        user_update(id: $id, data: {
          lastLogin: $lastLogin
        })
      }
    `;

    const updateResult = await sqlConnect.executeGraphql(updateMutation, {
      variables: {
        id: userId,
        lastLogin: new Date().toISOString()
      }
    });

    if (updateResult.data.user_update.id !== userId) {
      throw new Error('Update returned mismatching ID');
    }
    console.log('[Test] Update OK');

    // 4. Delete User
    console.log(`[Test] Cleaning up and deleting user...`);
    const deleteMutation = `
      mutation DeleteUser($id: UUID!) {
        user_delete(id: $id)
      }
    `;

    await sqlConnect.executeGraphql(deleteMutation, {
      variables: { id: userId }
    });
    console.log('[Test] Delete OK');

    console.log('[Test] All operations completed successfully!');
    return true;
  } catch (error) {
    console.error('[Test] Operations Failed:', error.message);
    return false;
  }
}

if (require.main === module) {
  testOperations().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = testOperations;
