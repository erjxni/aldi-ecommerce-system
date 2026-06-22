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

// Import database and JWT
const { sqlConnect } = require('./db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'aldi_secret_jwt_key_2026';

// Middleware to authenticate JWT requests
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const headerToken = authHeader && authHeader.split(' ')[1];
  const queryToken = req.query.token;
  const xToken = req.headers['x-auth-token'];
  const token = headerToken || queryToken || xToken;

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ detail: 'Forbidden: Invalid or expired token' });
      }
      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ detail: 'Unauthorized: Missing token' });
  }
};

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
app.post('/api/register', async (req, res) => {
  const { email, password, confirm_password } = req.body;
  if (!email || !password) return res.status(400).json({ detail: 'Email and password required' });
  if (password !== confirm_password) return res.status(400).json({ detail: 'Passwords do not match' });

  try {
    // Check if user already exists
    const selectQuery = `
      query GetUser($email: String!) {
        users(where: { email: { eq: $email } }) {
          email
        }
      }
    `;

    const selectResult = await sqlConnect.executeGraphqlRead(selectQuery, {
      variables: { email }
    });

    if (selectResult.data && selectResult.data.users && selectResult.data.users.length > 0) {
      return res.status(400).json({ detail: 'Email already registered' });
    }

    // Insert user
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

    const displayName = email.split('@')[0];
    const insertResult = await sqlConnect.executeGraphql(insertMutation, {
      variables: {
        email,
        passwordHash: password,
        role: 'customer',
        displayName
      }
    });

    res.json({ message: 'User registered successfully', id: insertResult.data.user_insert.id });
  } catch (err) {
    console.error('Error during registration:', err);
    return res.status(500).json({ detail: 'Database error' });
  }
});

// API: Login User
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ detail: 'Email and password required' });

  try {
    const selectQuery = `
      query GetUser($email: String!) {
        users(where: { email: { eq: $email } }) {
          id
          email
          passwordHash
          displayName
        }
      }
    `;

    const selectResult = await sqlConnect.executeGraphqlRead(selectQuery, {
      variables: { email }
    });

    if (!selectResult.data || !selectResult.data.users || selectResult.data.users.length === 0) {
      return res.status(401).json({ detail: 'Invalid email or password' });
    }

    const user = selectResult.data.users[0];
    if (user.passwordHash !== password) {
      return res.status(401).json({ detail: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, first_name: user.displayName },
      JWT_SECRET,
      { expiresIn: '1m' }
    );

    // Update lastLogin timestamp
    const updateMutation = `
      mutation UpdateLastLogin($id: UUID!, $lastLogin: Timestamp!) {
        user_update(id: $id, data: {
          lastLogin: $lastLogin
        })
      }
    `;

    await sqlConnect.executeGraphql(updateMutation, {
      variables: {
        id: user.id,
        lastLogin: new Date().toISOString()
      }
    });

    res.json({ email: user.email, token, first_name: user.displayName });
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ detail: 'Database error' });
  }
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