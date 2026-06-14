const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable Cross-Origin Resource Sharing
app.use(cors());

// Serve static files from the frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

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

// Fallback routing: send index.html for undefined frontend routes (if needed)
app.get('*', (req, res, next) => {
  // Only fallback for non-API routes
  if (req.url.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`ALDI Ecommerce Server is running on port ${PORT}`);
  console.log(`Local address: http://localhost:${PORT}`);
});
