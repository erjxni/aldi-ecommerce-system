const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'ecommerce.db');

// Connect to SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Initialize user schema
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            first_name TEXT DEFAULT 'User',
            last_name TEXT DEFAULT '',
            phone_number TEXT DEFAULT 'Unknown',
            status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
            token TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) console.error('Error creating users table:', err.message);
      });
      
      db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`, (err) => {
        if (err) console.error('Error creating email index:', err.message);
      });
    });
  }
});

module.exports = db;
