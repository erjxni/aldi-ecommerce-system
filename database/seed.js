const { sqlConnect } = require('../backend/db');
const { seedProducts } = require('./seed-products');

// List of mock users to seed
const mockUsers = [
  {
    email: 'admin@aldi-mock.com',
    password: 'adminPassword123',
    role: 'admin',
    displayName: 'Admin User',
    phoneNumber: '(555) 019-2831',
    address: '123 ALDI Headquarters Way'
  },
  {
    email: 'financial@aldi-mock.com',
    password: 'financialPassword123',
    role: 'financial_officer',
    displayName: 'Financial Officer',
    phoneNumber: '(555) 019-2832',
    address: '456 Audit & Accounts Lane'
  },
  {
    email: 'employee@aldi-mock.com',
    password: 'employeePassword123',
    role: 'employee',
    displayName: 'Store Employee',
    phoneNumber: '(555) 019-2833',
    address: '789 Retail Store Boulevard'
  },
  {
    email: 'customer_1@aldi-mock.com',
    password: 'customerPassword1',
    role: 'customer',
    displayName: 'Patricia Martinez',
    phoneNumber: '(555) 432-1001',
    address: '101 Maple Drive'
  },
  {
    email: 'customer_2@aldi-mock.com',
    password: 'customerPassword2',
    role: 'customer',
    displayName: 'Jessica Thomas',
    phoneNumber: '(555) 432-1002',
    address: '202 Oak Avenue'
  },
  {
    email: 'customer_3@aldi-mock.com',
    password: 'customerPassword3',
    role: 'customer',
    displayName: 'Mary Jones',
    phoneNumber: '(555) 432-1003',
    address: '303 Pine Road'
  },
  {
    email: 'customer_4@aldi-mock.com',
    password: 'customerPassword4',
    role: 'customer',
    displayName: 'Robert Smith',
    phoneNumber: '(555) 432-1004',
    address: '404 Elm Street'
  },
  {
    email: 'customer_5@aldi-mock.com',
    password: 'customerPassword5',
    role: 'customer',
    displayName: 'Jennifer Brown',
    phoneNumber: '(555) 432-1005',
    address: '505 Cedar Lane'
  },
  {
    email: 'customer_6@aldi-mock.com',
    password: 'customerPassword6',
    role: 'customer',
    displayName: 'Michael Davis',
    phoneNumber: '(555) 432-1006',
    address: '606 Birch Court'
  },
  {
    email: 'customer_7@aldi-mock.com',
    password: 'customerPassword7',
    role: 'customer',
    displayName: 'Linda Wilson',
    phoneNumber: '(555) 432-1007',
    address: '707 Walnut Way'
  },
  {
    email: 'test_customer@aldi-mock.com',
    password: 'customerPassword123',
    role: 'customer',
    displayName: 'Taylor Customer',
    phoneNumber: '(555) 432-1008',
    address: '808 Spruce Street'
  }
];

async function seed() {
  try {
    console.log('Connecting to Firebase SQL Connect...');

    // Wipe existing users in the collection
    console.log('Wiping existing users...');
    const deleteMutation = `
      mutation DeleteAll {
        user_deleteMany(all: true)
      }
    `;
    const deleteResult = await sqlConnect.executeGraphql(deleteMutation);
    const deletedCount = deleteResult.data.user_deleteMany;
    console.log(`Deleted ${deletedCount} existing user documents.`);

    console.log(`Seeding ${mockUsers.length} mock users...`);
    const insertMutation = `
      mutation InsertUser($email: String!, $passwordHash: String!, $role: String!, $displayName: String!, $phoneNumber: String, $address: String) {
        user_insert(data: {
          email: $email,
          passwordHash: $passwordHash,
          role: $role,
          displayName: $displayName,
          phoneNumber: $phoneNumber,
          address: $address
        })
      }
    `;

    for (const user of mockUsers) {
      console.log(`Inserting: ${user.email} (${user.role})...`);
      await sqlConnect.executeGraphql(insertMutation, {
        variables: {
          email: user.email,
          passwordHash: user.password,
          role: user.role,
          displayName: user.displayName,
          phoneNumber: user.phoneNumber,
          address: user.address
        }
      });
    }

    console.log('\n--- Seeding Complete ---');
    console.log('SQL Connect database populated successfully.\n');

    console.log('Here are the credentials you can log in with:');
    console.log('--------------------------------------------------');
    mockUsers.forEach(u => {
      console.log(`Name:  ${u.displayName}`);
      console.log(`Email: ${u.email}`);
      console.log(`Pass:  ${u.password}`);
      console.log(`Role:  ${u.role}`);
      console.log('--------------------------------------------------');
    });

    console.log('Seeding production product catalog and stock batches...');
    const productCount = await seedProducts();
    console.log(`Seeded ${productCount} product records with stock batches.`);

    return {
      users: mockUsers.length,
      products: productCount
    };
  } catch (error) {
    console.error('Error during seeding:', error);
    throw error;
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = {
  seed,
  mockUsers
};
