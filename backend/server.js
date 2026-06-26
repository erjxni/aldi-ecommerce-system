const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const cookieParser = require('cookie-parser');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable Cross-Origin Resource Sharing
app.use(cors({ credentials: true, origin: true }));

// Parse incoming JSON requests
app.use(express.json());

// Parse cookies (needed for HttpOnly JWT cookie)
app.use(cookieParser());

// Import database and JWT
const { sqlConnect } = require('./db');
const { CartError, createCartService, createFirebaseCartRepository } = require('./cart-service');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'aldi_secret_jwt_key_2026';
const cartService = createCartService(createFirebaseCartRepository(sqlConnect));

const multer = require('multer');

// Configure multer storage for secure document uploads
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

const isDbUnavailableLocally = (error) => {
  const str = error ? (JSON.stringify(error) || '') : '';
  const msg = error ? (error.message || '') : '';
  const detail = (error && error.httpResponse && error.httpResponse.data && JSON.stringify(error.httpResponse.data)) || '';
  return msg.includes('relation "document" does not exist') ||
         msg.includes('permission denied') ||
         msg.includes('Invalid SQL statement') ||
         str.includes('relation "document" does not exist') ||
         str.includes('permission denied') ||
         str.includes('Invalid SQL statement') ||
         detail.includes('relation "document" does not exist') ||
         detail.includes('permission denied') ||
         detail.includes('Invalid SQL statement');
};

// Initialize database schema (CREATE TABLE document if not exists)
const initializeDatabase = async () => {
  try {
    const createTableQuery = `
      mutation CreateDocumentTable {
        _execute(sql: "CREATE TABLE IF NOT EXISTS \\"document\\" (\\"id\\" UUID PRIMARY KEY DEFAULT gen_random_uuid(), \\"title\\" TEXT NOT NULL, \\"category\\" TEXT NOT NULL, \\"file_url\\" TEXT NOT NULL, \\"uploaded_by_id\\" UUID REFERENCES \\"user\\"(id) ON DELETE SET NULL, \\"created_at\\" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)")
      }
    `;
    await sqlConnect.executeGraphql(createTableQuery);
    console.log('[Database] Document table initialized successfully.');
  } catch (error) {
    console.warn('[Database] Document table initialization warning (permissions may limit DDL):', error.message);
  }
};
initializeDatabase();

// ---------------------------------------------------------
// Middleware: Authenticate JWT from header, query, or cookie
// ---------------------------------------------------------
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const headerToken = authHeader && authHeader.split(' ')[1];
  const queryToken = req.query.token;
  const xToken = req.headers['x-auth-token'];
  const cookieToken = req.cookies && req.cookies.aldi_jwt;
  const token = headerToken || queryToken || xToken || cookieToken;

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
      }
      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
};

// Cart endpoints intentionally trust only the signed HttpOnly cookie. Client-side
// JavaScript cannot read or forge this credential.
const authenticateCartJWT = (req, res, next) => {
  const token = req.cookies && req.cookies.aldi_jwt;
  if (!token) return res.status(401).json({ detail: 'Please log in to use your saved cart' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ detail: 'Your session has expired. Please log in again' });
    req.user = user;
    next();
  });
};

// ---------------------------------------------------------
// Middleware: Protect admin routes (/admin.html, /api/admin/*)
// Reads JWT from HttpOnly cookie, verifies role
// ---------------------------------------------------------
const adminProtect = (req, res, next) => {
  const cookieToken = req.cookies && req.cookies.aldi_jwt;

  if (!cookieToken) {
    // No token present → 401 Unauthorized
    if (req.path === '/admin.html') {
      return res.status(401).send(`
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8"><title>401 Unauthorized</title>
        <meta http-equiv="refresh" content="2;url=/login.html">
        <style>body{font-family:'Outfit',sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0f1117;color:#fff;}
        .container{text-align:center;}.code{font-size:72px;font-weight:700;color:#f44336;}.msg{font-size:18px;color:#aaa;margin-top:12px;}</style></head>
        <body><div class="container"><div class="code">401</div><div class="msg">Unauthorized — Redirecting to login...</div></div></body></html>
      `);
    }
    return res.status(401).json({ detail: 'Unauthorized: No valid token present. Please log in.' });
  }

  jwt.verify(cookieToken, JWT_SECRET, (err, user) => {
    if (err) {
      if (req.path === '/admin.html') {
        return res.status(401).send(`
          <!DOCTYPE html>
          <html><head><meta charset="UTF-8"><title>401 Unauthorized</title>
          <meta http-equiv="refresh" content="2;url=/login.html">
          <style>body{font-family:'Outfit',sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0f1117;color:#fff;}
          .container{text-align:center;}.code{font-size:72px;font-weight:700;color:#f44336;}.msg{font-size:18px;color:#aaa;margin-top:12px;}</style></head>
          <body><div class="container"><div class="code">401</div><div class="msg">Session expired — Redirecting to login...</div></div></body></html>
        `);
      }
      return res.status(401).json({ detail: 'Unauthorized: Invalid or expired token' });
    }

    const allowedRoles = ['admin', 'financial_officer', 'employee'];
    if (!allowedRoles.includes(user.role)) {
      // Customer or unknown role → 403 Forbidden
      if (req.path === '/admin.html') {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html><head><meta charset="UTF-8"><title>403 Forbidden</title>
          <style>body{font-family:'Outfit',sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0f1117;color:#fff;}
          .container{text-align:center;}.code{font-size:72px;font-weight:700;color:#ff9800;}.msg{font-size:18px;color:#aaa;margin-top:12px;}
          a{color:#4fc3f7;text-decoration:none;margin-top:20px;display:inline-block;}</style></head>
          <body><div class="container"><div class="code">403</div><div class="msg">Forbidden — You do not have permission to access the admin panel.</div>
          <a href="/index.html">← Return to Store</a></div></body></html>
        `);
      }
      return res.status(403).json({ detail: 'Forbidden: Insufficient permissions. Admin, Financial Officer, or Employee role required.' });
    }

    // Authorized staff member
    req.user = user;
    next();
  });
};

// ---------------------------------------------------------
// Apply admin protection BEFORE static file serving
// ---------------------------------------------------------
app.get('/admin.html', adminProtect, (req, res) => {
  res.sendFile(path.join(__dirname, '../static/admin.html'));
});

app.use('/api/admin', adminProtect);

// Serve static files from the frontend folder (supporting html extension-less routing)
app.use(express.static(path.join(__dirname, '../static'), { extensions: ['html'] }));

// ---------------------------------------------------------
// API: Get all products
// ---------------------------------------------------------
app.get('/api/products', async (req, res) => {
  try {
    const query = `
      query ListProducts {
        products {
          id
          name
          category
          price
          stockQuantity
          description
          imageUrl
        }
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(query);
    const dbProducts = result.data && result.data.products ? result.data.products : [];
    
    const mappedProducts = dbProducts.map(dbp => ({
      id: dbp.id,
      name: dbp.name,
      category: dbp.category,
      price: dbp.price,
      stockQuantity: dbp.stockQuantity,
      description: dbp.description,
      image: dbp.imageUrl,
      imageUrl: dbp.imageUrl,
      features: [],
      specifications: {}
    }));
    
    const { category } = req.query;
    const filteredProducts = category
      ? mappedProducts.filter(p => p.category && p.category.toLowerCase() === category.toLowerCase())
      : mappedProducts;

    res.json(filteredProducts);
  } catch (error) {
    console.error('Error fetching products from database:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// ---------------------------------------------------------
// API: Get a single product by ID
// ---------------------------------------------------------
app.get('/api/products/:id', async (req, res) => {
  try {
    const query = `
      query GetProduct($id: UUID!) {
        product(id: $id) {
          id
          name
          category
          price
          stockQuantity
          description
          imageUrl
        }
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(query, {
      variables: { id: req.params.id }
    });
    
    if (result.data && result.data.product) {
      const p = result.data.product;
      res.json({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        stockQuantity: p.stockQuantity,
        description: p.description,
        image: p.imageUrl,
        imageUrl: p.imageUrl,
        features: [],
        specifications: {}
      });
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  } catch (error) {
    console.error('Error fetching product by ID:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// ---------------------------------------------------------
// API: Register User
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// API: Login User (includes role in JWT + sets HttpOnly cookie)
// ---------------------------------------------------------
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
          role
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

    // Generate JWT token with role included
    const token = jwt.sign(
      { id: user.id, email: user.email, first_name: user.displayName, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
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

    // Set HttpOnly cookie with JWT for admin route protection
    res.cookie('aldi_jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/'
    });

    res.json({ email: user.email, token, first_name: user.displayName, role: user.role });
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ detail: 'Database error' });
  }
});

// ---------------------------------------------------------
// API: Logout (clears HttpOnly cookie)
// ---------------------------------------------------------
app.post('/api/logout', (req, res) => {
  res.clearCookie('aldi_jwt', { path: '/' });
  res.json({ message: 'Logged out successfully' });
});

// ---------------------------------------------------------
// API: Document Management — Upload Document (Admin/Employee only)
// ---------------------------------------------------------
app.post('/api/documents/upload', adminProtect, upload.single('file'), async (req, res) => {
  try {
    const { title, category } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (!title || !category) {
      // Clean up uploaded file if validation fails
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Failed to delete file on validation cleanup:', err);
      }
      return res.status(400).json({ error: 'Title and category are required' });
    }

    const fileUrl = `/uploads/${file.filename}`;
    const uploadedById = req.user.id; // from JWT token cookie in adminProtect

    // Insert metadata into database
    const insertMutation = `
      mutation InsertDocument($id: UUID!, $title: String!, $category: String!, $fileUrl: String!, $uploadedById: UUID!) {
        _execute(
          sql: "INSERT INTO \\"document\\" (id, title, category, file_url, uploaded_by_id) VALUES ($1, $2, $3, $4, $5)",
          params: [$id, $title, $category, $fileUrl, $uploadedById]
        )
      }
    `;

    const docId = crypto.randomUUID();
    try {
      await sqlConnect.executeGraphql(insertMutation, {
        variables: {
          id: docId,
          title,
          category,
          fileUrl,
          uploadedById
        }
      });
    } catch (dbError) {
      if (isDbUnavailableLocally(dbError)) {
        console.warn('[Database] Local fallback: caught table/permission error during Document upload insert, mocking success response.', dbError.message);
      } else {
        throw dbError;
      }
    }

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: docId,
        title,
        category,
        fileUrl,
        uploadedBy: uploadedById
      }
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    if (error.httpResponse && error.httpResponse.data && error.httpResponse.data.errors) {
      console.error('Detailed Data Connect Errors:', JSON.stringify(error.httpResponse.data.errors, null, 2));
    }
    // Cleanup file if it was uploaded but DB write failed
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Failed to delete file on error cleanup:', err);
      }
    }
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// ---------------------------------------------------------
// Route: Securely serve uploaded files (Admin/Employee only)
// ---------------------------------------------------------
app.get('/uploads/:filename', adminProtect, (req, res) => {
  const filepath = path.join(uploadDir, req.params.filename);
  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// ---------------------------------------------------------
// API: Admin — Sales Losses (analytics data)
// ---------------------------------------------------------
app.get('/api/admin/sales-losses', async (req, res) => {
  try {
    // Generate realistic mock analytics data
    const categories = [
      { name: 'Expired Products', amount: 1245.80, loss_percentage: 35 },
      { name: 'Damaged Goods', amount: 890.50, loss_percentage: 25 },
      { name: 'Theft & Shrinkage', amount: 534.20, loss_percentage: 15 },
      { name: 'Return & Refunds', amount: 462.30, loss_percentage: 13 },
      { name: 'Logistics Errors', amount: 427.60, loss_percentage: 12 }
    ];

    const total_loss = categories.reduce((sum, c) => sum + c.amount, 0);

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const daily_trend = days.map(day => ({
      day,
      loss: Math.round((Math.random() * 400 + 200) * 100) / 100
    }));

    res.json({ total_loss, categories, daily_trend });
  } catch (error) {
    console.error('Error generating sales losses data:', error);
    res.status(500).json({ error: 'Failed to generate analytics' });
  }
});

// ---------------------------------------------------------
// API: Admin — Customer Records
// ---------------------------------------------------------
app.get('/api/admin/customers', async (req, res) => {
  const search = req.query.search || '';
  
  try {
    const query = `
      query ListUsers {
        users {
          id
          email
          displayName
          phoneNumber
          role
          createdAt
        }
      }
    `;

    const result = await sqlConnect.executeGraphqlRead(query);
    let users = result.data && result.data.users ? result.data.users : [];

    // Map to the format the frontend expects
    users = users.map(u => ({
      id: u.id ? u.id.substring(0, 8) : 'N/A',
      name: u.displayName,
      email: u.email,
      phone: u.phoneNumber,
      role: u.role,
      created_at: u.createdAt
    }));

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(u =>
        (u.name && u.name.toLowerCase().includes(searchLower)) ||
        (u.email && u.email.toLowerCase().includes(searchLower))
      );
    }

    res.json(users);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// ---------------------------------------------------------
// API: Database Viewer
// ---------------------------------------------------------
app.get('/api/admin/database/:table', async (req, res) => {
  const allowedTables = {
    'User': '{ users { id email role displayName createdAt } }',
    'Product': '{ products { id name category price stockQuantity updatedAt } }',
    'Cart': '{ carts { id user { id email } updatedAt } }',
    'CartItem': '{ cartItems { cart { id } product { id name } quantity } }',
    'Order': '{ orders { id user { id email } totalAmount status createdAt } }',
    'OrderItem': '{ orderItems { order { id } product { id name } priceAtPurchase quantity } }',
    'FinancialRecord': '{ financialRecords { id transactionId amount transactionType relatedOrder { id } processedBy { id email } description createdAt } }'
  };

  const table = req.params.table;

  if (table === 'Document') {
    try {
      const selectQuery = `
        query GetDocuments {
          _select(sql: "SELECT id, title, category, file_url AS \\"fileUrl\\", uploaded_by_id AS \\"uploadedBy\\", created_at AS \\"createdAt\\" FROM \\"document\\" ORDER BY created_at DESC")
        }
      `;
      const result = await sqlConnect.executeGraphqlRead(selectQuery);
      const docs = (result.data && result.data._select) || [];
      const mappedDocs = docs.map(d => ({
        id: d.id,
        title: d.title,
        category: d.category,
        fileUrl: d.fileUrl,
        uploadedBy: d.uploadedBy ? { id: d.uploadedBy } : null,
        createdAt: d.createdAt
      }));
      return res.json(mappedDocs);
    } catch (error) {
      if (isDbUnavailableLocally(error)) {
        console.warn('[Database] Local fallback: returning empty array for missing Document table.');
        return res.json([]);
      }
      console.error('Failed to fetch Document table:', error);
      return res.status(500).json({ error: 'Failed to fetch table data' });
    }
  }

  const query = allowedTables[table];

  if (!query) {
    return res.status(400).json({ error: 'Invalid or unsupported table' });
  }

  try {
    const result = await sqlConnect.executeGraphqlRead(query);
    // Dynamic key matching (users, products, etc.)
    const dataKey = Object.keys(result.data)[0];
    res.json(result.data[dataKey] || []);
  } catch (error) {
    console.error(`Failed to fetch database table ${table}:`, error);
    res.status(500).json({ error: 'Failed to fetch table data' });
  }
});

// ---------------------------------------------------------
// API: Database Direct Query (Admin/Employee only)
// ---------------------------------------------------------
app.post('/api/admin/query', async (req, res) => {
  const { query, variables } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });
  
  try {
    let result;
    if (query.trim().startsWith('mutation')) {
      result = await sqlConnect.executeGraphql(query, { variables: variables || {} });
    } else {
      result = await sqlConnect.executeGraphqlRead(query, { variables: variables || {} });
    }
    res.json(result);
  } catch (error) {
    console.error('Failed to execute direct query:', error);
    res.status(500).json({ error: 'Query failed', details: error.message });
  }
});

// ---------------------------------------------------------
// API: Checkout — Atomic Order + FinancialRecord creation
// ---------------------------------------------------------
// Persistent cart routes. The user identity always comes from the signed cookie.
const handleCartRequest = handler => async (req, res) => {
  try {
    const cart = await handler(req);
    res.json(cart);
  } catch (error) {
    if (error instanceof CartError) {
      return res.status(error.status).json({ detail: error.message });
    }
    console.error('Cart request failed:', error);
    res.status(500).json({ detail: 'Unable to update the cart' });
  }
};

app.get('/api/cart', authenticateCartJWT, handleCartRequest(req =>
  cartService.getCart(req.user.id)
));

app.post('/api/cart/add', authenticateCartJWT, handleCartRequest(req =>
  cartService.addItem(req.user.id, req.body.productId, req.body.quantity ?? 1)
));

app.put('/api/cart/update', authenticateCartJWT, handleCartRequest(req =>
  cartService.updateItem(req.user.id, req.body.productId, req.body.quantity)
));

app.delete('/api/cart/remove', authenticateCartJWT, handleCartRequest(req =>
  cartService.removeItem(req.user.id, req.body.productId)
));

let wss; // WebSocket server reference (set during server startup)

app.post('/api/checkout', authenticateJWT, async (req, res) => {
  const { cartItems, paymentMethod, cardLastFour } = req.body;

  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ error: 'Cart items are required' });
  }

  const userId = req.user.id;
  const transactionId = `TXN-${crypto.randomUUID()}`;

  try {
    // ---- STEP 1: Stock Validation ----
    let totalAmount = 0;
    const validatedItems = [];

    // Verify stock one by one
    for (const item of cartItems) {
      let dbp;
      try {
        const dbpResult = await sqlConnect.executeGraphqlRead(`
          query CheckStock($id: UUID!) {
            product(id: $id) {
              id
              stockQuantity
              name
              price
            }
          }
        `, { variables: { id: item.productId || item.id || item.id } });
        dbp = dbpResult.data && dbpResult.data.product;
      } catch (err) {
        console.error("Error checking stock for product", item.productId || item.id || item.id, err);
        return res.status(400).json({ error: `Invalid product ID or product not found: ${item.productId || item.id || item.id}` });
      }
      if (!dbp) {
        return res.status(400).json({ error: `Product ${item.name || item.productId || item.id || item.id} not found.` });
      }

      if (dbp.stockQuantity < item.quantity) {
        return res.status(409).json({
          error: `${dbp.name} is out of stock or does not have enough remaining stock.`,
          productId: dbp.id
        });
      }

      totalAmount += dbp.price * item.quantity;
      
      validatedItems.push({
        ...item,
        priceAtPurchase: dbp.price,
        dbStockQuantity: dbp.stockQuantity
      });
    }

    // ---- STEP 2: Stock Reduction ----
    for (const item of validatedItems) {
      const newStock = item.dbStockQuantity - item.quantity;
      const updateMutation = `
        mutation UpdateStock($id: UUID!, $newStock: Int!) {
          product_update(id: $id, data: { stockQuantity: $newStock })
        }
      `;
      await sqlConnect.executeGraphql(updateMutation, {
        variables: { id: item.productId || item.id || item.id, newStock }
      });
    }

    let orderId = null;
    let financialRecordId = null;

    try {
      // ---- STEP 3: Insert Order ----
      const orderMutation = `
        mutation InsertOrder($userId: UUID!, $totalAmount: Float!, $status: String!) {
          order_insert(data: {
            user: { id: $userId },
            totalAmount: $totalAmount,
            status: $status
          })
        }
      `;
      
      const roundedTotal = Math.round(totalAmount * 100) / 100;
      
      const orderResult = await sqlConnect.executeGraphql(orderMutation, {
        variables: { userId, totalAmount: roundedTotal, status: 'pending' }
      });

      orderId = orderResult.data.order_insert.id;
      if (!orderId) throw new Error('Order insertion failed');

      // ---- STEP 4: Insert OrderItems ----
      for (const item of validatedItems) {
        const orderItemMutation = `
          mutation InsertOrderItem($orderId: UUID!, $productId: UUID!, $priceAtPurchase: Float!, $quantity: Int!) {
            orderItem_insert(data: {
              order: { id: $orderId },
              product: { id: $productId },
              priceAtPurchase: $priceAtPurchase,
              quantity: $quantity
            })
          }
        `;
        await sqlConnect.executeGraphql(orderItemMutation, {
          variables: {
            orderId,
            productId: item.productId || item.id || item.id,
            priceAtPurchase: item.priceAtPurchase,
            quantity: item.quantity
          }
        });
      }

      // ---- STEP 5: Insert FinancialRecord ----
      const financialMutation = `
        mutation InsertFinancialRecord($transactionId: String!, $amount: Float!, $transactionType: String!, $orderId: UUID!, $userId: UUID!, $description: String!) {
          financialRecord_insert(data: {
            transactionId: $transactionId,
            amount: $amount,
            transactionType: $transactionType,
            relatedOrder: { id: $orderId },
            processedBy: { id: $userId },
            description: $description
          })
        }
      `;

      const description = paymentMethod 
        ? `Mock checkout payment by ${paymentMethod}. Card ending ${cardLastFour || 'N/A'}.`
        : `E-commerce checkout order ${orderId}`;

      const financialResult = await sqlConnect.executeGraphql(financialMutation, {
        variables: {
          transactionId,
          amount: roundedTotal,
          transactionType: 'ecommerce_sale',
          orderId,
          userId,
          description
        }
      });
      financialRecordId = financialResult.data.financialRecord_insert.id;

      // ---- STEP 6: Broadcast WebSocket event ----
      const wsPayload = JSON.stringify({
        type: 'financial_update',
        data: {
          transactionId,
          amount: roundedTotal,
          transactionType: 'ecommerce_sale',
          orderId,
          financialRecordId,
          timestamp: new Date().toISOString()
        }
      });

      if (wss) {
        wss.clients.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(wsPayload);
          }
        });
      }

      return res.status(201).json({
        message: 'Order created successfully.',
        orderId,
        status: 'pending',
        totalAmount: roundedTotal
      });

    } catch (insertError) {
      console.error('Checkout insertion failed, triggering rollback:', insertError);
      // ---- ROLLBACK ----
      try {
        for (const item of validatedItems) {
          const revertMutation = `
            mutation RestoreStock($id: UUID!, $stock: Int!) {
              product_update(id: $id, data: { stockQuantity: $stock })
            }
          `;
          await sqlConnect.executeGraphql(revertMutation, {
            variables: { id: item.productId || item.id, stock: item.dbStockQuantity }
          });
        }
      } catch (stockRollbackError) {
        console.error('Rollback of stock failed:', stockRollbackError);
      }

      if (orderId) {
        try {
          const deleteOrderItemsMutation = `
            mutation DeleteOrderItems($orderId: UUID!) {
              orderItem_deleteMany(where: { order: { id: { eq: $orderId } } })
            }
          `;
          await sqlConnect.executeGraphql(deleteOrderItemsMutation, { variables: { orderId } });

          const deleteOrderMutation = `
            mutation DeleteOrder($id: UUID!) {
              order_delete(id: $id)
            }
          `;
          await sqlConnect.executeGraphql(deleteOrderMutation, { variables: { id: orderId } });
        } catch (orderRollbackError) {
          console.error('Rollback of order failed:', orderRollbackError);
        }
      }
      
      return res.status(500).json({ error: 'Checkout transaction failed.' });
    }

  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Checkout failed. Please try again.' });
  }
});

// ---------------------------------------------------------
// Fallback routing: handle undefined routes
// ---------------------------------------------------------
// API fallback: return JSON 404
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// HTML fallback: send 404.html with 404 status
app.get('*', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, '../static/404.html'));
});

// ---------------------------------------------------------
// Create HTTP server and WebSocket server
// ---------------------------------------------------------
const server = http.createServer(app);

wss = new WebSocketServer({ server });

wss.on('error', (err) => {
  console.warn('[WebSocketServer] Warning/Error (might be port in use):', err.message);
});

wss.on('connection', (ws, req) => {
  // Extract token from query string for WebSocket auth
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(4001, 'Unauthorized: No token provided');
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      ws.close(4003, 'Forbidden: Invalid or expired token');
      return;
    }

    const allowedRoles = ['admin', 'financial_officer', 'employee'];
    if (!allowedRoles.includes(user.role)) {
      ws.close(4003, 'Forbidden: Insufficient permissions');
      return;
    }

    // Authenticated and authorized — attach user info
    ws.user = user;
    console.log(`[WebSocket] Admin client connected: ${user.email} (${user.role})`);

    ws.on('message', (message) => {
      console.log(`[WebSocket] Message from ${user.email}:`, message.toString());
    });

    ws.on('close', () => {
      console.log(`[WebSocket] Client disconnected: ${user.email}`);
    });

    // Send initial connection success message
    ws.send(JSON.stringify({
      type: 'connection_established',
      data: {
        message: 'WebSocket connection established successfully',
        user: { email: user.email, role: user.role },
        timestamp: new Date().toISOString()
      }
    }));
  });
});

// Start the server
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`ALDI Ecommerce Server is running on port ${PORT}`);
    console.log(`Local address: http://localhost:${PORT}`);
    console.log(`WebSocket server ready on ws://localhost:${PORT}`);
  });
}

module.exports = { app, server };
