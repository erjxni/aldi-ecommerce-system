const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, '../backend/ecommerce.db');

// Connect to SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

const firstNames = ["John", "Mary", "Robert", "Patricia", "Michael", "Jennifer", "William", "Elizabeth", "David", "Linda", "James", "Barbara", "Joseph", "Susan", "Thomas", "Jessica"];
const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas"];

function generateRandomPassword() {
  return crypto.randomBytes(4).toString('hex'); // Generates an 8-character hex string
}

function generateRandomPhone() {
  const area = Math.floor(Math.random() * 800) + 200;
  const prefix = Math.floor(Math.random() * 800) + 200;
  const line = Math.floor(Math.random() * 9000) + 1000;
  return `(${area}) ${prefix}-${line}`;
}

const numUsers = 4000;

db.serialize(() => {
  console.log('Wiping existing users table...');
  db.run('DELETE FROM users');
  
  console.log(`Seeding ${numUsers} mock users...`);
  
  const stmt = db.prepare(`
    INSERT INTO users (email, password_hash, first_name, last_name, phone_number, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const sampleUsers = [];

  for (let i = 1; i <= numUsers; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const email = `user_${i}@aldi-mock.com`;
    const password = generateRandomPassword();
    const phone = generateRandomPhone();
    
    // Save first 3 for printing
    if (i <= 3) {
      sampleUsers.push({ email, password, name: `${firstName} ${lastName}` });
    }

    stmt.run(email, password, firstName, lastName, phone, 'active');
  }

  stmt.finalize(() => {
    console.log('\n--- Seeding Complete ---');
    console.log('Database populated successfully.');
    console.log('\nHere are some sample users you can log in with:');
    sampleUsers.forEach(u => {
      console.log(`Name: ${u.name}`);
      console.log(`Email: ${u.email}`);
      console.log(`Password: ${u.password}`);
      console.log('-------------------------');
    });
    
    db.close();
  });
});
