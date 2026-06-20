const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable Cross-Origin Resource Sharing
app.use(cors());

// Parse incoming JSON requests
app.use(express.json());

// Import database
const db = require('./db');

// Serve static files from the frontend folder
app.use(express.static(path.join(__dirname, '../static')));

// Helper function to read database/products.json
const getProductsData = () => {
  const filePath = path.join(__dirname, '../database/products.json');
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading products database:', error);
    return [];
  }
};

// API: Get all products
app.get('/api/products', (req, res) => {
  const products = getProductsData();
  res.json(products);
});

// API: Get a single product by ID
app.get('/api/products/:id', (req, res) => {
  const products = getProductsData();
  const product = products.find(p => p.id === req.params.id);
  
  if (product) {
    res.json(product);
  } else {
    res.status(404).json({ error: 'Product not found' });
  }
});

// API: Register User
const crypto = require('crypto');
app.post('/api/register', (req, res) => {
  const { email, password, confirm_password } = req.body;
  if (!email || !password) return res.status(400).json({ detail: 'Email and password required' });
  if (password !== confirm_password) return res.status(400).json({ detail: 'Passwords do not match' });

  // Simple registration logic (storing password as plain text for mockup)
  db.run(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, [email, password], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ detail: 'Email already registered' });
      }
      return res.status(500).json({ detail: 'Database error' });
    }
    res.json({ message: 'User registered successfully', id: this.lastID });
  });
});

// API: Login User
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ detail: 'Email and password required' });

  db.get(`SELECT * FROM users WHERE email = ? AND password_hash = ?`, [email, password], (err, row) => {
    if (err) return res.status(500).json({ detail: 'Database error' });
    if (!row) return res.status(401).json({ detail: 'Invalid email or password' });

    // Generate random token
    const token = crypto.randomBytes(16).toString('hex');
    db.run(`UPDATE users SET token = ? WHERE id = ?`, [token, row.id], (err) => {
      if (err) return res.status(500).json({ detail: 'Error generating session' });
      res.json({ email: row.email, token, first_name: row.first_name });
    });
  });
});

// Fallback routing: send index.html for undefined frontend routes (if needed)
app.get('*', (req, res, next) => {
  // Only fallback for non-API routes
  if (req.url.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../static/index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`ALDI Ecommerce Server is running on port ${PORT}`);
  console.log(`Local address: http://localhost:${PORT}`);
});