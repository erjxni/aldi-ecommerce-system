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
        mutation InsertFinancialRecord($transactionId: String!, $amount: Float!, $transactionType: String!, $orderId: UUID!, $description: String!) {
          financialRecord_insert(data: {
            transactionId: $transactionId,
            amount: $amount,
            transactionType: $transactionType,
            relatedOrder: { id: $orderId },
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
server.listen(PORT, () => {
  console.log(`ALDI Ecommerce Server is running on port ${PORT}`);
  console.log(`Local address: http://localhost:${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}`);
});
