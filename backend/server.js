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
const { sqlConnect, storage } = require('./db');
const { CartError, createCartService, createFirebaseCartRepository } = require('./cart-service');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'aldi_secret_jwt_key_2026';
const cartService = createCartService(createFirebaseCartRepository(sqlConnect));
const nlpHelper = require('./nlp-helper');
const docCache = require('./document-content-cache');

// Helper: compute total stock for a product from StockBatch table
async function getProductStock(productId) {
  try {
    const result = await sqlConnect.executeGraphqlRead(`
      query GetStock($productId: UUID!) {
        stockBatches(where: { product: { id: { eq: $productId } } }) {
          currentQuantity
        }
      }
    `, { variables: { productId } });
    const batches = result.data?.stockBatches || [];
    return batches.reduce((sum, b) => sum + (b.currentQuantity || 0), 0);
  } catch (err) {
    console.warn('Could not fetch stock for product', productId, err.message);
    return 0;
  }
}

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

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
// Reads JWT from HttpOnly cookie or API token, verifies role
// ---------------------------------------------------------
const adminProtect = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const xToken = req.headers['x-auth-token'];
  const queryToken = req.query.token;
  const cookieToken = req.cookies && req.cookies.aldi_jwt;
  const token = cookieToken || headerToken || xToken || queryToken;

  if (!token) {
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

  jwt.verify(token, JWT_SECRET, (err, user) => {
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
          description
          imageUrl
          stockBatches_on_product {
            currentQuantity
          }
        }
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(query);
    const dbProducts = result.data && result.data.products ? result.data.products : [];
    
    const mappedProducts = dbProducts.map(dbp => {
      const batches = dbp.stockBatches_on_product || [];
      const stockQuantity = batches.reduce((sum, b) => sum + (b.currentQuantity || 0), 0);
      return {
        id: dbp.id,
        name: dbp.name,
        category: dbp.category,
        price: dbp.price,
        stockQuantity,
        description: dbp.description,
        image: dbp.imageUrl,
        imageUrl: dbp.imageUrl,
        features: [],
        specifications: {}
      };
    });
    
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
          description
          imageUrl
          stockBatches_on_product {
            currentQuantity
          }
        }
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(query, {
      variables: { id: req.params.id }
    });
    
    if (result.data && result.data.product) {
      const p = result.data.product;
      const batches = p.stockBatches_on_product || [];
      const stockQuantity = batches.reduce((sum, b) => sum + (b.currentQuantity || 0), 0);
      res.json({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        stockQuantity,
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
      mutation InsertUser($email: String!, $passwordHash: String!, $role: String!, $displayName: String!, $photoUrl: String!) {
        user_insert(data: {
          email: $email,
          passwordHash: $passwordHash,
          role: $role,
          displayName: $displayName,
          photoUrl: $photoUrl
        })
      }
    `;

    const displayName = email.split('@')[0];
    const insertResult = await sqlConnect.executeGraphql(insertMutation, {
      variables: {
        email,
        passwordHash: password,
        role: 'customer',
        displayName,
        photoUrl: '/assets/images/default-photo.jpg'
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
          photoUrl
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

    res.json({ id: user.id, email: user.email, token, first_name: user.displayName, role: user.role, photoUrl: user.photoUrl });
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
// API: Admin — Upload Profile Photo (Admin/Employee only)
// ---------------------------------------------------------
app.post('/api/admin/users/upload-photo', adminProtect, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    const bucket = storage.bucket();
    const uniqueFileName = `profiles/${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    
    const file = bucket.file(uniqueFileName);
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
      }
    });

    // Make the file public so we can get a download URL
    await file.makePublic();
    const photoUrl = file.publicUrl();

    res.json({ photoUrl });
  } catch (error) {
    console.error('Error uploading photo to Firebase Storage:', error);
    res.status(500).json({ error: 'Failed to upload photo to storage.' });
  }
});

// ---------------------------------------------------------
// API: Profile Settings (Any authenticated user)
// ---------------------------------------------------------
app.get('/api/profile/me', authenticateJWT, async (req, res) => {
  const userId = req.user.id;
  try {
    const query = `
      query GetUserProfile($id: UUID!) {
        users(where: { id: { eq: $id } }) {
          id
          email
          displayName
          phoneNumber
          address
          photoUrl
          role
        }
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(query, {
      variables: { id: userId }
    });
    if (!result.data || !result.data.users || result.data.users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.data.users[0]);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

app.post('/api/profile/upload-photo', authenticateJWT, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    const bucket = storage.bucket();
    const uniqueFileName = `profiles/${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    
    const file = bucket.file(uniqueFileName);
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
      }
    });

    await file.makePublic();
    const photoUrl = file.publicUrl();

    res.json({ photoUrl });
  } catch (error) {
    console.error('Error uploading photo to Firebase Storage:', error);
    res.status(500).json({ error: 'Failed to upload photo to storage.' });
  }
});

app.put('/api/profile/update', authenticateJWT, async (req, res) => {
  const { displayName, phoneNumber, address, photoUrl } = req.body;
  const userId = req.user.id;
  
  if (!displayName || displayName.trim() === '') {
    return res.status(400).json({ error: 'Display name is required' });
  }

  try {
    const updateMutation = `
      mutation UpdateUserProfile($id: UUID!, $displayName: String!, $phoneNumber: String, $address: String, $photoUrl: String) {
        user_update(id: $id, data: { displayName: $displayName, phoneNumber: $phoneNumber, address: $address, photoUrl: $photoUrl })
      }
    `;

    const result = await sqlConnect.executeGraphql(updateMutation, {
      variables: {
        id: userId,
        displayName: displayName.trim(),
        phoneNumber: phoneNumber ? phoneNumber.trim() : null,
        address: address ? address.trim() : null,
        photoUrl: photoUrl || null
      }
    });

    if (result.errors) {
      return res.status(400).json({ error: result.errors[0].message });
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
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
      return res.status(400).json({ error: 'Title and category are required' });
    }

    const bucket = storage.bucket();
    const uniqueFileName = `documents/${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;

    const storageFile = bucket.file(uniqueFileName);
    await storageFile.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      }
    });

    const fileUrl = storageFile.publicUrl();
    const uploadedById = req.user.id; // from JWT token cookie in adminProtect

    // Insert metadata into database (including created_at column)
    const insertMutation = `
      mutation InsertDocument($id: UUID!, $title: String!, $category: String!, $fileUrl: String!, $uploadedById: UUID!) {
        _execute(
          sql: "INSERT INTO \\"document\\" (id, title, category, file_url, uploaded_by_id, created_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)",
          params: [$id, $title, $category, $fileUrl, $uploadedById]
        )
      }
    `;

    const docId = crypto.randomUUID();
    await sqlConnect.executeGraphql(insertMutation, {
      variables: {
        id: docId,
        title,
        category,
        fileUrl,
        uploadedById
      }
    });

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: docId,
        title,
        category,
        fileUrl: `/api/documents/download/${docId}`,
        uploadedBy: uploadedById
      }
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    if (error.httpResponse && error.httpResponse.data && error.httpResponse.data.errors) {
      console.error('Detailed Data Connect Errors:', JSON.stringify(error.httpResponse.data.errors, null, 2));
    }
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Helper to extract bucket path from Firebase Storage URL
const extractStoragePath = (url, bucketName) => {
  try {
    const decodedUrl = decodeURIComponent(url);
    const regex = new RegExp(`${bucketName}/(documents/[^?#]+)`);
    const match = decodedUrl.match(regex);
    if (match && match[1]) {
      return match[1];
    }
    const docIndex = decodedUrl.indexOf('/documents/');
    if (docIndex !== -1) {
      return decodedUrl.substring(docIndex + 1).split('?')[0];
    }
  } catch (e) {
    console.error('Failed to extract storage path:', e);
  }
  return null;
};

// ---------------------------------------------------------
// API: Document Management — Search Documents (Admin/Employee only)
// ---------------------------------------------------------
app.get('/api/documents/search', adminProtect, async (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.json({
      query: { q: '', sentiment: { score: 0, label: 'Neutral' }, keywords: [] },
      documents: []
    });
  }

  try {
    // 1. Analyze query sentiment and keywords
    const querySentiment = nlpHelper.analyzeSentiment(q);
    const queryKeywords = nlpHelper.extractKeywords(q);

    // 2. Fetch all documents from the database
    const selectQuery = `
      query SearchDocuments {
        _select(
          sql: "SELECT d.id, d.title, d.category, d.file_url AS \\"fileUrl\\", d.uploaded_by_id AS \\"uploadedById\\", u.display_name AS \\"uploadedByDisplayName\\", d.created_at AS \\"createdAt\\" FROM \\"document\\" d LEFT JOIN \\"user\\" u ON d.uploaded_by_id = u.id ORDER BY d.created_at DESC"
        )
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(selectQuery);
    const docs = (result.data && result.data._select) || [];

    const matchingDocs = [];
    const queryLower = q.toLowerCase();

    for (const d of docs) {
      // 3. Retrieve parsed PDF/document text content (lazy downloaded & locally cached)
      const content = await docCache.getDocumentContent(d.id, d.fileUrl);

      const titleMatch = d.title && d.title.toLowerCase().includes(queryLower);
      const categoryMatch = d.category && d.category.toLowerCase().includes(queryLower);
      const contentMatch = content && content.toLowerCase().includes(queryLower);

      if (titleMatch || categoryMatch || contentMatch) {
        const originalUrl = d.fileUrl || '';
        const extension = originalUrl.split('.').pop().split('?')[0].toLowerCase();
        
        // Analyze combined text (title, category, and content snippet)
        const textToAnalyze = `${d.title} ${d.category} ${content.substring(0, 500)}`;
        const docSentiment = nlpHelper.analyzeSentiment(textToAnalyze);
        const docKeywords = nlpHelper.extractKeywords(textToAnalyze);

        matchingDocs.push({
          id: d.id,
          title: d.title,
          category: d.category,
          fileUrl: `/api/documents/download/${d.id}`,
          extension,
          uploadedBy: {
            id: d.uploadedById,
            displayName: d.uploadedByDisplayName || 'N/A'
          },
          createdAt: d.createdAt,
          sentiment: docSentiment,
          keywords: docKeywords
        });
      }
    }
    
    res.json({
      query: {
        q,
        sentiment: querySentiment,
        keywords: queryKeywords
      },
      documents: matchingDocs
    });
  } catch (error) {
    console.error('Failed to search documents:', error);
    res.status(500).json({ error: 'Failed to search documents' });
  }
});

// ---------------------------------------------------------
// API: Document Management — Secure Download (Admin/Employee only)
// ---------------------------------------------------------
app.get('/api/documents/download/:id', adminProtect, async (req, res) => {
  const docId = req.params.id;
  try {
    const selectQuery = `
      query GetDocumentForDownload {
        _select(sql: "SELECT file_url AS \\"fileUrl\\" FROM \\"document\\" WHERE id = '${docId}'")
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(selectQuery);
    const docs = (result.data && result.data._select) || [];

    if (docs.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const fileUrl = docs[0].fileUrl;
    const bucket = storage.bucket();
    const storagePath = extractStoragePath(fileUrl, bucket.name);

    if (!storagePath) {
      return res.status(400).json({ error: 'Invalid document storage URL' });
    }

    const storageFile = bucket.file(storagePath);
    const [exists] = await storageFile.exists();
    if (!exists) {
      return res.status(404).json({ error: 'File not found in storage' });
    }

    const [metadata] = await storageFile.getMetadata();
    res.setHeader('Content-Type', metadata.contentType || 'application/octet-stream');
    
    const dispositionType = req.query.download === 'true' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${dispositionType}; filename="${storagePath.split('/').pop()}"`);

    storageFile.createReadStream()
      .on('error', (streamErr) => {
        console.error('Error streaming document:', streamErr);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming document file' });
        }
      })
      .pipe(res);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// ---------------------------------------------------------
// API: Document Management — Delete Document (Admin/Employee only)
// ---------------------------------------------------------
app.delete('/api/documents/:id', adminProtect, async (req, res) => {
  const docId = req.params.id;
  try {
    const selectQuery = `
      query GetDocumentForDelete {
        _select(sql: "SELECT d.file_url AS \\"fileUrl\\", u.role AS \\"uploaderRole\\" FROM \\"document\\" d LEFT JOIN \\"user\\" u ON d.uploaded_by_id = u.id WHERE d.id = '${docId}'")
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(selectQuery);
    const docs = (result.data && result.data._select) || [];

    if (docs.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Role hierarchy check: admin (3) > financial_officer (2) > employee (1) > customer (0)
    const roleHierarchy = {
      'admin': 3,
      'financial_officer': 2,
      'employee': 1,
      'customer': 0
    };

    const requesterRole = req.user.role || 'employee';
    const uploaderRole = docs[0].uploaderRole || 'employee';

    if (roleHierarchy[requesterRole] < roleHierarchy[uploaderRole]) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to delete files uploaded by higher-ranking roles' });
    }

    const fileUrl = docs[0].fileUrl;
    const bucket = storage.bucket();
    const storagePath = extractStoragePath(fileUrl, bucket.name);

    if (storagePath) {
      try {
        const storageFile = bucket.file(storagePath);
        const [exists] = await storageFile.exists();
        if (exists) {
          await storageFile.delete();
          console.log(`[Storage] Deleted file from Firebase Storage: ${storagePath}`);
        }
      } catch (err) {
        console.warn('[Storage] Warning: Failed to delete file from Firebase Storage:', err.message);
      }
    }

    const deleteMutation = `
      mutation DeleteDocument {
        _execute(sql: "DELETE FROM \\"document\\" WHERE id = '${docId}'")
      }
    `;
    await sqlConnect.executeGraphql(deleteMutation);

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ---------------------------------------------------------
// Route: Securely serve uploaded files (Admin/Employee only)
// ---------------------------------------------------------
app.get('/uploads/:filename', adminProtect, async (req, res) => {
  try {
    const { getStorage } = require('firebase-admin/storage');
    const bucket = getStorage().bucket('aldi-ecommerce-managemen-b40e8.firebasestorage.app');
    const file = bucket.file(`documents/${req.params.filename}`);

    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'File not found' });
    }

    const [metadata] = await file.getMetadata();
    if (metadata.contentType) {
      res.setHeader('Content-Type', metadata.contentType);
    }

    file.createReadStream().pipe(res);
  } catch (error) {
    console.error('Error serving file from storage:', error);
    res.status(500).json({ error: 'Failed to retrieve file' });
  }
});

// ---------------------------------------------------------
// API: Meetings Management (Admin/Employee/Finance only)
// ---------------------------------------------------------
app.post('/api/meetings', adminProtect, async (req, res) => {
  const { title, description, date } = req.body;
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required and must be a string' });
  }
  if (!date || isNaN(Date.parse(date))) {
    return res.status(400).json({ error: 'A valid date is required' });
  }
  const desc = (description && typeof description === 'string') ? description.trim() : '';

  try {
    const id = crypto.randomUUID();
    const query = `
      mutation CreateMeeting($id: UUID!, $title: String!, $description: String!, $date: Timestamp!) {
        _execute(
          sql: "INSERT INTO \\"meeting\\" (id, title, description, date, minutes_document_id, created_at) VALUES ($1, $2, $3, CAST($4 AS timestamp with time zone), NULL, CURRENT_TIMESTAMP)",
          params: [$id, $title, $description, $date]
        )
      }
    `;
    await sqlConnect.executeGraphql(query, {
      variables: {
        id,
        title: title.trim(),
        description: desc,
        date: new Date(date).toISOString()
      }
    });

    res.status(201).json({
      id,
      title: title.trim(),
      description: desc,
      date,
      minutesDocumentId: null
    });
  } catch (error) {
    console.error('Error creating meeting:', error);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

app.get('/api/meetings', adminProtect, async (req, res) => {
  try {
    const query = `
      query GetMeetings {
        _select(
          sql: "SELECT m.id, m.title, m.description, m.date, m.minutes_document_id AS \\"minutesDocumentId\\", d.title AS \\"minutesDocumentTitle\\" FROM \\"meeting\\" m LEFT JOIN \\"document\\" d ON m.minutes_document_id = d.id ORDER BY m.date ASC"
        )
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(query);
    const meetings = (result.data && result.data._select) || [];
    res.json(meetings);
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

app.patch('/api/meetings/:id', adminProtect, async (req, res) => {
  const meetingId = req.params.id;
  const { minutesDocumentId } = req.body;

  try {
    const query = `
      mutation LinkMinutes($meetingId: UUID!, $minutesDocumentId: String) {
        _execute(
          sql: "UPDATE \\"meeting\\" SET minutes_document_id = CAST($2 AS uuid) WHERE id = $1",
          params: [$meetingId, $minutesDocumentId]
        )
      }
    `;
    await sqlConnect.executeGraphql(query, {
      variables: {
        meetingId,
        minutesDocumentId: minutesDocumentId || null
      }
    });

    res.json({ message: 'Meeting updated successfully', id: meetingId, minutesDocumentId });
  } catch (error) {
    console.error('Error updating meeting minutes link:', error);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

app.post('/api/meetings/:id/minutes', adminProtect, async (req, res) => {
  const meetingId = req.params.id;
  const { content } = req.body;

  if (content === undefined || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content must be a string' });
  }

  try {
    const checkQuery = `
      query CheckMeeting($id: UUID!) {
        _select(sql: "SELECT id, title, minutes_document_id AS \\"minutesDocumentId\\" FROM \\"meeting\\" WHERE id = $1", params: [$id])
      }
    `;
    const checkRes = await sqlConnect.executeGraphqlRead(checkQuery, { variables: { id: meetingId } });
    const meetings = (checkRes.data && checkRes.data._select) || [];
    if (meetings.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    const meeting = meetings[0];

    let docId = meeting.minutesDocumentId;
    let doc = null;

    if (docId) {
      const docQuery = `
        query GetDoc($id: UUID!) {
          _select(sql: "SELECT id, file_url AS \\"fileUrl\\" FROM \\"document\\" WHERE id = $1", params: [$id])
        }
      `;
      const docRes = await sqlConnect.executeGraphqlRead(docQuery, { variables: { id: docId } });
      const docs = (docRes.data && docRes.data._select) || [];
      if (docs.length > 0) {
        doc = docs[0];
      }
    }

    const bucket = storage.bucket();

    if (doc) {
      const storagePath = extractStoragePath(doc.fileUrl, bucket.name);
      if (storagePath) {
        const storageFile = bucket.file(storagePath);
        await storageFile.save(Buffer.from(content, 'utf8'), {
          metadata: { contentType: 'text/plain' }
        });
        return res.json({
          message: 'Minutes updated successfully',
          documentId: doc.id,
          fileUrl: `/api/documents/download/${doc.id}`
        });
      }
    }

    // Otherwise, create a new minutes document
    const generatedDocId = crypto.randomUUID();
    const title = `Minutes - ${meeting.title}`;
    const category = 'Governance';
    const storagePath = `documents/minutes_${meetingId}_${Date.now()}.txt`;
    const storageFile = bucket.file(storagePath);
    await storageFile.save(Buffer.from(content, 'utf8'), {
      metadata: { contentType: 'text/plain' }
    });
    await storageFile.makePublic();
    const fileUrl = storageFile.publicUrl();

    // Insert document row
    const insertDoc = `
      mutation InsertDoc($id: UUID!, $title: String!, $category: String!, $fileUrl: String!, $uploadedById: UUID!) {
        _execute(
          sql: "INSERT INTO \\"document\\" (id, title, category, file_url, uploaded_by_id, created_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)",
          params: [$id, $title, $category, $fileUrl, $uploadedById]
        )
      }
    `;
    await sqlConnect.executeGraphql(insertDoc, {
      variables: {
        id: generatedDocId,
        title,
        category,
        fileUrl,
        uploadedById: req.user.id
      }
    });

    // Link the new document to the meeting
    const linkQuery = `
      mutation LinkDoc($meetingId: UUID!, $docId: UUID!) {
        _execute(
          sql: "UPDATE \\"meeting\\" SET minutes_document_id = $2 WHERE id = $1",
          params: [$meetingId, $docId]
        )
      }
    `;
    await sqlConnect.executeGraphql(linkQuery, {
      variables: {
        meetingId: meeting.id,
        docId: generatedDocId
      }
    });

    res.status(201).json({
      message: 'Minutes created and linked successfully',
      documentId: generatedDocId,
      fileUrl: `/api/documents/download/${generatedDocId}`
    });
  } catch (error) {
    console.error('Error saving meeting minutes:', error);
    res.status(500).json({ error: 'Failed to save minutes' });
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
    'User': '{ users { id email role displayName photoUrl createdAt } }',
    'Product': '{ products { id name category price imageUrl updatedAt } }',
    'Cart': '{ carts { id user { id email } updatedAt } }',
    'CartItem': '{ cartItems { cart { id } product { id name } quantity } }',
    'Order': '{ orders { id user { id email } totalAmount status createdAt } }',
    'OrderItem': '{ orderItems { order { id } product { id name } priceAtPurchase quantity } }',
    'FinancialRecord': '{ financialRecords { id transactionId amount transactionType relatedOrder { id } processedBy { id email } description createdAt } }',
    'StockBatch': '{ stockBatches { id product { id name } initialQuantity currentQuantity expiryDate receivedAt piecePrice } }',
    'Notification': '{ notifications { id user { id email } type message isRead createdAt } }',
    'Poll': '{ polls { id title description options status createdAt closesAt } }',
    'Vote': '{ votes { poll { id title } userId selectedOption createdAt } }'
  };

  const table = req.params.table;

  if (table === 'Meeting') {
    try {
      const selectQuery = `
        query GetMeetings {
          _select(sql: "SELECT m.id, m.title, m.description, m.date, m.minutes_document_id AS \\"minutesDocumentId\\", m.created_at AS \\"createdAt\\" FROM \\"meeting\\" m ORDER BY m.date ASC")
        }
      `;
      const result = await sqlConnect.executeGraphqlRead(selectQuery);
      const meetings = (result.data && result.data._select) || [];
      return res.json(meetings);
    } catch (error) {
      console.error('Failed to fetch Meeting table:', error);
      return res.status(500).json({ error: 'Failed to fetch table data' });
    }
  }

  if (table === 'Document') {
    try {
      const selectQuery = `
        query GetDocuments {
          _select(sql: "SELECT d.id, d.title, d.category, d.file_url AS \\"fileUrl\\", d.uploaded_by_id AS \\"uploadedById\\", u.display_name AS \\"uploadedByDisplayName\\", d.created_at AS \\"createdAt\\" FROM \\"document\\" d LEFT JOIN \\"user\\" u ON d.uploaded_by_id = u.id ORDER BY d.created_at DESC")
        }
      `;
      const result = await sqlConnect.executeGraphqlRead(selectQuery);
      const docs = (result.data && result.data._select) || [];
      const mappedDocs = docs.map(d => {
        const originalUrl = d.fileUrl || '';
        const extension = originalUrl.split('.').pop().split('?')[0].toLowerCase();
        return {
          id: d.id,
          title: d.title,
          category: d.category,
          fileUrl: `/api/documents/download/${d.id}`,
          extension,
          uploadedBy: {
            id: d.uploadedById,
            displayName: d.uploadedByDisplayName || 'N/A'
          },
          createdAt: d.createdAt
        };
      });
      return res.json(mappedDocs);
    } catch (error) {
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

    // Verify stock one by one using StockBatch table
    for (const item of cartItems) {
      let dbp;
      const productId = item.productId || item.id;
      try {
        const dbpResult = await sqlConnect.executeGraphqlRead(`
          query CheckStock($id: UUID!) {
            product(id: $id) {
              id
              name
              price
            }
          }
        `, { variables: { id: productId } });
        dbp = dbpResult.data && dbpResult.data.product;
      } catch (err) {
        console.error("Error checking stock for product", productId, err);
        return res.status(400).json({ error: `Invalid product ID or product not found: ${productId}` });
      }
      if (!dbp) {
        return res.status(400).json({ error: `Product ${item.name || productId} not found.` });
      }

      // Get total stock from StockBatch table
      const totalStock = await getProductStock(productId);

      if (totalStock < item.quantity) {
        return res.status(409).json({
          error: `${dbp.name} is out of stock or does not have enough remaining stock.`,
          productId: dbp.id
        });
      }

      totalAmount += dbp.price * item.quantity;
      
      validatedItems.push({
        ...item,
        productId,
        priceAtPurchase: dbp.price,
        dbTotalStock: totalStock
      });
    }

    // ---- STEP 2: Stock Reduction (FIFO from StockBatch) ----
    for (const item of validatedItems) {
      let remaining = item.quantity;
      // Fetch batches ordered by expiry (FIFO: earliest expiry first)
      const batchResult = await sqlConnect.executeGraphqlRead(`
        query GetBatches($productId: UUID!) {
          stockBatches(where: { product: { id: { eq: $productId } } }, orderBy: [{ expiryDate: ASC }]) {
            id
            currentQuantity
          }
        }
      `, { variables: { productId: item.productId } });
      const batches = batchResult.data?.stockBatches || [];

      for (const batch of batches) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, batch.currentQuantity);
        const newQty = batch.currentQuantity - deduct;
        await sqlConnect.executeGraphql(`
          mutation UpdateBatch($id: UUID!, $qty: Int!) {
            stockBatch_update(id: $id, data: { currentQuantity: $qty })
          }
        `, { variables: { id: batch.id, qty: newQty } });
        remaining -= deduct;
      }
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
        // Rollback: Re-add stock to earliest-expiry batches
        for (const item of validatedItems) {
          let remaining = item.quantity;
          const batchResult = await sqlConnect.executeGraphqlRead(`
            query GetBatches($productId: UUID!) {
              stockBatches(where: { product: { id: { eq: $productId } } }, orderBy: [{ expiryDate: ASC }]) {
                id
                currentQuantity
                initialQuantity
              }
            }
          `, { variables: { productId: item.productId } });
          const batches = batchResult.data?.stockBatches || [];

          for (const batch of batches) {
            if (remaining <= 0) break;
            const canRestore = Math.min(remaining, batch.initialQuantity - batch.currentQuantity);
            if (canRestore > 0) {
              await sqlConnect.executeGraphql(`
                mutation RestoreBatch($id: UUID!, $qty: Int!) {
                  stockBatch_update(id: $id, data: { currentQuantity: $qty })
                }
              `, { variables: { id: batch.id, qty: batch.currentQuantity + canRestore } });
              remaining -= canRestore;
            }
          }
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
function getAuthenticatedUserRole(req) {
    return (
        req.user?.role ||
        req.user?.userRole ||
        req.user?.accountRole ||
        req.user?.claims?.role ||
        ""
    );
}

function requireFinanceAccess(req, res, next) {
    const role = getAuthenticatedUserRole(req);

    const allowedRoles = ["admin", "financial_officer"];

    if (!allowedRoles.includes(role)) {
        return res.status(403).json({
            error: "Forbidden: finance summary is only available to admin or financial officer users."
        });
    }

    return next();
}

function getDateRangeFromQuery(query) {
    const now = new Date();

    const defaultStartDate = new Date();
    defaultStartDate.setDate(now.getDate() - 30);

    const startDate = query.startDate
        ? new Date(query.startDate)
        : defaultStartDate;

    const endDate = query.endDate
        ? new Date(query.endDate)
        : now;

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return null;
    }

    return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
    };
}

function summarizeFinancialRecords(records) {
    let totalRevenue = 0;
    let totalExpenses = 0;

    const groupedByType = {};

    records.forEach((record) => {
        const amount = Number(record.amount || 0);
        const transactionType = record.transactionType || "unknown";

        if (!groupedByType[transactionType]) {
            groupedByType[transactionType] = {
                transactionType,
                totalAmount: 0,
                recordCount: 0
            };
        }

        groupedByType[transactionType].totalAmount += amount;
        groupedByType[transactionType].recordCount += 1;

        if (transactionType === "ecommerce_sale") {
            totalRevenue += amount;
        }

        if (transactionType === "operational_cost") {
            totalExpenses += amount;
        }
    });

    return {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalExpenses: Number(totalExpenses.toFixed(2)),
        totalProfit: Number((totalRevenue - totalExpenses).toFixed(2)),
        groupedByType: Object.values(groupedByType).map((group) => ({
            ...group,
            totalAmount: Number(group.totalAmount.toFixed(2))
        }))
    };
}

app.get("/api/finance/summary", authenticateJWT, requireFinanceAccess, async (req, res) => {
    const dateRange = getDateRangeFromQuery(req.query);

    if (!dateRange) {
        return res.status(400).json({
            error: "Invalid startDate or endDate query parameter."
        });
    }

    try {
        // 1. Fetch financial records (ecommerce sales)
        const selectQuery = `
            query GetFinancialRecords {
                _select(sql: "SELECT id, transaction_id AS \\"transactionId\\", amount, transaction_type AS \\"transactionType\\", description, related_order_id AS \\"relatedOrderId\\", created_at AS \\"createdAt\\" FROM \\"financial_record\\" WHERE created_at >= '${dateRange.startDate}' AND created_at <= '${dateRange.endDate}' ORDER BY created_at DESC")
            }
        `;
        const result = await sqlConnect.executeGraphqlRead(selectQuery);
        const records = (result.data && result.data._select) || [];

        const normalised = records.map(r => ({
            ...r,
            amount: Number(r.amount || 0)
        }));

        // 2. Fetch stock batches within the date range to calculate expenses
        const batchesQuery = `
            query GetStockBatches {
                _select(sql: "SELECT sb.id, sb.initial_quantity AS \\"initialQuantity\\", sb.piece_price AS \\"piecePrice\\", sb.received_at AS \\"receivedAt\\", p.name AS \\"productName\\" FROM \\"stock_batch\\" sb LEFT JOIN \\"product\\" p ON sb.product_id = p.id WHERE sb.received_at >= '${dateRange.startDate}' AND sb.received_at <= '${dateRange.endDate}' ORDER BY sb.received_at DESC")
            }
        `;
        const batchesResult = await sqlConnect.executeGraphqlRead(batchesQuery);
        const batches = (batchesResult.data && batchesResult.data._select) || [];

        // 3. Map stock batches to operational cost records
        const batchRecords = batches.map(b => ({
            id: b.id,
            transactionId: `sb-${b.id.substring(0, 8)}`,
            amount: Number((Number(b.initialQuantity || 0) * Number(b.piecePrice || 0)).toFixed(2)),
            transactionType: "operational_cost",
            description: `Restocked ${b.initialQuantity} units of ${b.productName || 'unknown product'} @ €${Number(b.piecePrice || 0).toFixed(2)}/unit`,
            relatedOrderId: null,
            createdAt: b.receivedAt
        }));

        // 4. Merge and sort chronologically descending
        const allRecords = [...normalised, ...batchRecords];
        allRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const summary = summarizeFinancialRecords(allRecords);

        return res.status(200).json({
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
            summary,
            records: allRecords
        });
    } catch (error) {
        console.error("Failed to load finance summary:", error);

        return res.status(500).json({
            error: "Failed to load finance summary."
        });
    }
});

app.get('/api/finance/losses', adminProtect, async (req, res) => {
  let { startDate, endDate } = req.query;

  // Helper to format Date to local YYYY-MM-DD string
  const toLocalDateString = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Default to the current week (Monday to Sunday) if dates are missing
  if (!startDate || !endDate) {
    const today = new Date();
    const day = today.getDay();
    const diffToMon = today.getDate() - day + (day === 0 ? -6 : 1);
    
    const monday = new Date(today.getFullYear(), today.getMonth(), diffToMon);
    const sunday = new Date(today.getFullYear(), today.getMonth(), diffToMon + 6);

    startDate = toLocalDateString(monday);
    endDate = toLocalDateString(sunday);
  }

  const s = new Date(startDate + 'T00:00:00');
  const e = new Date(endDate + 'T23:59:59.999');

  // Calculate the previous period of the same duration for comparison
  const durationMs = e.getTime() - s.getTime();
  const prevS = new Date(s.getTime() - durationMs - 1);
  const prevE = new Date(s.getTime() - 1);

  try {
    const query = `
      query GetExpiredBatchesCompare($startDate: Timestamp!, $endDate: Timestamp!) {
        stockBatches(where: {
          expiryDate: { ge: $startDate, le: $endDate },
          currentQuantity: { gt: 0 }
        }) {
          id
          currentQuantity
          expiryDate
          piecePrice
          product {
            id
            name
            price
          }
        }
      }
    `;

    // Query across both the previous and current periods to save a DB call
    const result = await sqlConnect.executeGraphqlRead(query, {
      variables: { 
        startDate: prevS.toISOString(), 
        endDate: e.toISOString() 
      }
    });

    const batches = result.data?.stockBatches || [];
    const dailyLosses = {};
    
    // Initialize dates in the current range with 0 loss using local date keys
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const dateKey = toLocalDateString(d);
      dailyLosses[dateKey] = 0;
    }

    let totalLoss = 0;
    let previousTotalLoss = 0;

    batches.forEach(b => {
      const expiry = new Date(b.expiryDate);
      const cost = b.piecePrice !== null && b.piecePrice !== undefined 
        ? b.piecePrice 
        : (b.product?.price ? Number((b.product.price * 0.6).toFixed(2)) : 0);
      const loss = b.currentQuantity * cost;

      if (expiry >= s && expiry <= e) {
        totalLoss += loss;
        const dateKey = toLocalDateString(expiry);
        if (dailyLosses[dateKey] !== undefined) {
          dailyLosses[dateKey] += loss;
        }
      } else if (expiry >= prevS && expiry <= prevE) {
        previousTotalLoss += loss;
      }
    });

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const formattedLosses = Object.keys(dailyLosses).map(dateStr => {
      const d = new Date(dateStr + 'T00:00:00');
      return {
        date: dateStr,
        dayName: daysOfWeek[d.getDay()],
        lossAmount: Number(dailyLosses[dateStr].toFixed(2))
      };
    });

    res.json({
      startDate,
      endDate,
      losses: formattedLosses,
      totalLoss: Number(totalLoss.toFixed(2)),
      previousTotalLoss: Number(previousTotalLoss.toFixed(2))
    });

  } catch (error) {
    console.error('Failed to load daily losses:', error);
    res.status(500).json({ error: 'Failed to load losses.' });
  }
});

app.get('/api/finance/losses-trend-6months', adminProtect, async (req, res) => {
  const now = new Date();
  const months = [];

  // Generate last 6 months info (ending with the current month)
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      name: d.toLocaleString('en-US', { month: 'short' }),
      lossAmount: 0
    });
  }

  const s = new Date(months[0].year, months[0].month, 1);
  const e = new Date(months[5].year, months[5].month + 1, 0, 23, 59, 59, 999);

  try {
    const query = `
      query GetExpiredBatchesTrend($startDate: Timestamp!, $endDate: Timestamp!) {
        stockBatches(where: {
          expiryDate: { ge: $startDate, le: $endDate },
          currentQuantity: { gt: 0 }
        }) {
          currentQuantity
          expiryDate
          piecePrice
          product {
            price
            category
          }
        }
      }
    `;

    const result = await sqlConnect.executeGraphqlRead(query, {
      variables: {
        startDate: s.toISOString(),
        endDate: e.toISOString()
      }
    });

    const batches = result.data?.stockBatches || [];
    const categoryLosses = {};

    batches.forEach(b => {
      const expiry = new Date(b.expiryDate);
      const cost = b.piecePrice !== null && b.piecePrice !== undefined 
        ? b.piecePrice 
        : (b.product?.price ? Number((b.product.price * 0.6).toFixed(2)) : 0);
      const loss = b.currentQuantity * cost;

      // Add to month trend
      const mMatch = months.find(m => m.year === expiry.getFullYear() && m.month === expiry.getMonth());
      if (mMatch) {
        mMatch.lossAmount += loss;
      }

      // Add to category grouping
      const cat = b.product?.category || 'Uncategorized';
      categoryLosses[cat] = (categoryLosses[cat] || 0) + loss;
    });

    // Formulate top category info
    let topCategoryName = 'None';
    let topCategoryPct = 0;
    const totalLossSum = Object.values(categoryLosses).reduce((sum, val) => sum + val, 0);

    if (totalLossSum > 0) {
      let maxLoss = 0;
      Object.keys(categoryLosses).forEach(cat => {
        if (categoryLosses[cat] > maxLoss) {
          maxLoss = categoryLosses[cat];
          topCategoryName = cat;
        }
      });
      topCategoryPct = Math.round((maxLoss / totalLossSum) * 100);
    }

    res.json({
      months: months.map(m => ({ name: m.name, lossAmount: Number(m.lossAmount.toFixed(2)) })),
      topCategory: {
        name: topCategoryName,
        percentage: topCategoryPct
      }
    });
  } catch (error) {
    console.error('Failed to load losses trend:', error);
    res.status(500).json({ error: 'Failed to load losses trend.' });
  }
});

app.get('/api/finance/customers-stats', adminProtect, async (req, res) => {
  let { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate query parameters are required.' });
  }

  const s = new Date(startDate + 'T00:00:00');
  const e = new Date(endDate + 'T23:59:59.999');

  try {
    const query = `
      query GetCustomerUsers {
        users(where: { role: { eq: "customer" } }) {
          id
          createdAt
        }
      }
    `;

    const result = await sqlConnect.executeGraphqlRead(query);
    const users = result.data?.users || [];

    const totalCustomers = users.length;
    let newCustomersCount = 0;

    const dailySignups = {};
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      dailySignups[dateKey] = 0;
    }

    users.forEach(u => {
      const created = new Date(u.createdAt);
      if (created >= s && created <= e) {
        newCustomersCount++;
        const dateKey = created.toISOString().split('T')[0];
        if (dailySignups[dateKey] !== undefined) {
          dailySignups[dateKey]++;
        }
      }
    });

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const formattedSignups = Object.keys(dailySignups).map(dateStr => {
      const d = new Date(dateStr + 'T00:00:00');
      return {
        date: dateStr,
        dayName: daysOfWeek[d.getDay()],
        count: dailySignups[dateStr]
      };
    });

    res.json({
      totalCustomers,
      newCustomersCount,
      dailySignups: formattedSignups
    });
  } catch (error) {
    console.error('Failed to load customer stats:', error);
    res.status(500).json({ error: 'Failed to load customer stats.' });
  }
});
// ==========================================================
// POLLING SYSTEM — SCRUM-190 / SCRUM-191 / SCRUM-193
// ==========================================================

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function graphqlSqlString(sql) {
  return JSON.stringify(sql.replace(/\s+/g, ' ').trim());
}

function sanitizeUuid(value) {
  return String(value || '').replace(/[^a-f0-9\-]/gi, '');
}

function parsePollOptions(options) {
  if (Array.isArray(options)) return options;
  if (typeof options === 'string') {
    try {
      const parsed = JSON.parse(options);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function normalizePollOptions(options) {
  if (!Array.isArray(options)) return [];
  const seen = new Set();
  return options
    .map(option => String(option).trim())
    .filter(Boolean)
    .filter(option => {
      const key = option.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isDuplicateVoteError(err) {
  const errMsg = String(err && err.message ? err.message : '').toLowerCase();
  const errCode = String(err && (err.code || err.sqlState) ? (err.code || err.sqlState) : '');
  const constraint = String(err && (err.constraint || err.constraint_name) ? (err.constraint || err.constraint_name) : '').toLowerCase();

  return (
    errCode === '23505' ||
    errCode === 'UNIQUE_VIOLATION' ||
    constraint.includes('uq_vote_poll_user') ||
    (constraint.includes('vote') && constraint.includes('poll') && constraint.includes('user')) ||
    errMsg.includes('uq_vote_poll_user') ||
    errMsg.includes('duplicate') ||
    errMsg.includes('already exists') ||
    (errMsg.includes('unique') && errMsg.includes('vote')) ||
    (errMsg.includes('unique constraint') && errMsg.includes('vote'))
  );
}

/**
 * SCRUM-193: Aggregation helper — counts votes grouped by selectedOption.
 * Returns: [{ option: String, count: Number }, ...]
 */
async function aggregateVotes(pollId) {
  // Sanitise to UUID format only (prevent injection)
  const safeId = sanitizeUuid(pollId);
  const sql = `SELECT selected_option AS "option", CAST(COUNT(*) AS INT) AS "count" FROM "vote" WHERE poll_id = '${safeId}' GROUP BY selected_option`;
  const query = `
    query AggregateVotes {
      _select(sql: ${graphqlSqlString(sql)})
    }
  `;
  try {
    const result = await sqlConnect.executeGraphqlRead(query);
    return (result.data && result.data._select) || [];
  } catch (err) {
    console.warn('[Polls] aggregateVotes error:', err.message);
    return [];
  }
}

// Helper: generate deterministic UUID for confidential votes to maintain voter anonymity while preventing duplicate votes.
function generateConfidentialVoteUserId(pollId, realUserId) {
  const hash = crypto.createHash('md5').update(pollId + JWT_SECRET + realUserId).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '3' + hash.substring(13, 16),
    '8' + hash.substring(17, 20),
    hash.substring(20, 32)
  ].join('-');
}

// ----------------------------------------------------------
// SCRUM-191: POST /api/polls — Admin-only poll creation
// ----------------------------------------------------------
app.post('/api/polls', adminProtect, async (req, res) => {
  // Only admins can create polls; employees/financial_officers can vote but not create
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden: Only administrators can create polls.'
    });
  }

  const { title, description, options, closesAt, isConfidential } = req.body;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Poll title is required.' });
  }
  const normalizedOptions = normalizePollOptions(options);
  if (normalizedOptions.length < 2) {
    return res.status(400).json({ error: 'At least two poll options are required.' });
  }

  const pollId = crypto.randomUUID();
  const optionsJson = JSON.stringify(normalizedOptions);
  let closesAtValue = 'NULL';
  let closesAtIso = null;

  if (closesAt) {
    const closesAtDate = new Date(closesAt);
    if (Number.isNaN(closesAtDate.getTime())) {
      return res.status(400).json({ error: 'closesAt must be a valid date.' });
    }
    closesAtIso = closesAtDate.toISOString();
    closesAtValue = `'${escapeSqlLiteral(closesAtIso)}'`;
  }

  const safeTitle = escapeSqlLiteral(title.trim());
  const safeDesc = escapeSqlLiteral((description || '').trim());
  const dbIsConfidential = isConfidential ? 'TRUE' : 'FALSE';

  const insertSql = `INSERT INTO "poll" (id, title, description, options, status, is_confidential, created_at, closes_at) VALUES ('${pollId}', '${safeTitle}', '${safeDesc}', '${escapeSqlLiteral(optionsJson)}', 'open', ${dbIsConfidential}, CURRENT_TIMESTAMP, ${closesAtValue})`;
  const insertMutation = `
    mutation InsertPoll {
      _execute(sql: ${graphqlSqlString(insertSql)})
    }
  `;

  try {
    await sqlConnect.executeGraphql(insertMutation);
    res.status(201).json({
      message: 'Poll created successfully.',
      poll: {
        id: pollId,
        title: title.trim(),
        description: (description || '').trim(),
        options: normalizedOptions,
        status: 'open',
        closesAt: closesAtIso,
        isConfidential: !!isConfidential
      }
    });
  } catch (err) {
    console.error('[Polls] Error creating poll:', err.message);
    res.status(500).json({ error: 'Failed to create poll.', detail: err.message });
  }
});

// ----------------------------------------------------------
// SCRUM-191: GET /api/polls/active — Retrieve all open polls
// Accessible to: admin, employee, financial_officer (via adminProtect)
// ----------------------------------------------------------
app.get('/api/polls/active', adminProtect, async (req, res) => {
  const sql = `SELECT id, title, description, options, status, is_confidential AS "isConfidential", created_at AS "createdAt", closes_at AS "closesAt" FROM "poll" WHERE status = 'open' AND (closes_at IS NULL OR closes_at > CURRENT_TIMESTAMP) ORDER BY created_at DESC`;
  const query = `
    query GetActivePolls {
      _select(sql: ${graphqlSqlString(sql)})
    }
  `;

  try {
    const result = await sqlConnect.executeGraphqlRead(query);
    const polls = (result.data && result.data._select) || [];

    const userId = req.user.id;
    const enriched = await Promise.all(polls.map(async (poll) => {
      const voteCounts = await aggregateVotes(poll.id);
      const isConf = poll.isConfidential === true || poll.isConfidential === 'true' || poll.isConfidential === 1 || poll.isConfidential === 't';

      // Check if this user already voted (deterministic user_id check if confidential)
      const safeUserId = sanitizeUuid(userId);
      const safePollId = sanitizeUuid(poll.id);
      let userVote = null;
      try {
        const targetVoteUserId = isConf
          ? generateConfidentialVoteUserId(safePollId, safeUserId)
          : safeUserId;

        const voteSql = `SELECT selected_option AS "selectedOption" FROM "vote" WHERE poll_id = '${safePollId}' AND user_id = '${targetVoteUserId}' LIMIT 1`;
        const voteCheck = await sqlConnect.executeGraphqlRead(`
          query CheckUserVote {
            _select(sql: ${graphqlSqlString(voteSql)})
          }
        `);
        const voteRows = (voteCheck.data && voteCheck.data._select) || [];
        if (voteRows.length > 0) {
          userVote = isConf ? 'confidential_voted' : voteRows[0].selectedOption;
        }
      } catch (e) {
        console.warn('[Polls] Could not check user vote:', e.message);
      }

      const parsedOptions = parsePollOptions(poll.options);

      return {
        id: poll.id,
        title: poll.title,
        description: poll.description,
        options: parsedOptions,
        status: poll.status,
        createdAt: poll.createdAt,
        closesAt: poll.closesAt,
        isConfidential: isConf,
        voteCounts,
        userVote
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('[Polls] Error fetching active polls:', err.message);
    res.status(500).json({ error: 'Failed to fetch active polls.' });
  }
});

// ----------------------------------------------------------
// SCRUM-191: POST /api/polls/:id/vote — Submit a vote
// ----------------------------------------------------------
app.post('/api/polls/:id/vote', adminProtect, async (req, res) => {
  const pollId = req.params.id;
  const userId = req.user.id;
  const { selectedOption } = req.body;

  if (!selectedOption || typeof selectedOption !== 'string' || selectedOption.trim() === '') {
    return res.status(400).json({ error: 'selectedOption is required.' });
  }

  const safePollId = sanitizeUuid(pollId);
  const safeUserId = sanitizeUuid(userId);

  let isConfidentialPoll = false;
  // Verify poll exists and is open
  try {
    const pollCheckSql = `SELECT id, status, is_confidential AS "isConfidential", closes_at AS "closesAt" FROM "poll" WHERE id = '${safePollId}' LIMIT 1`;
    const pollCheck = await sqlConnect.executeGraphqlRead(`
      query CheckPoll {
        _select(sql: ${graphqlSqlString(pollCheckSql)})
      }
    `);
    const polls = (pollCheck.data && pollCheck.data._select) || [];
    if (polls.length === 0) {
      return res.status(404).json({ error: 'Poll not found.' });
    }
    const poll = polls[0];
    if (poll.status !== 'open') {
      return res.status(409).json({ error: 'This poll is no longer accepting votes.' });
    }
    if (poll.closesAt && new Date(poll.closesAt) < new Date()) {
      return res.status(409).json({ error: 'This poll has already closed.' });
    }
    isConfidentialPoll = poll.isConfidential === true || poll.isConfidential === 'true' || poll.isConfidential === 1 || poll.isConfidential === 't';

    // Verify the selected option is valid for this poll
    const optionsSql = `SELECT options FROM "poll" WHERE id = '${safePollId}' LIMIT 1`;
    const optQuery = await sqlConnect.executeGraphqlRead(`
      query GetPollOptions {
        _select(sql: ${graphqlSqlString(optionsSql)})
      }
    `);
    const optRows = (optQuery.data && optQuery.data._select) || [];
    let pollOptions = [];
    if (optRows.length > 0) {
      pollOptions = parsePollOptions(optRows[0].options);
    }
    if (pollOptions.length > 0 && !pollOptions.includes(selectedOption.trim())) {
      return res.status(400).json({ error: 'Invalid option selected.' });
    }
  } catch (err) {
    console.error('[Polls] Error validating poll for vote:', err.message);
    return res.status(500).json({ error: 'Failed to validate poll.' });
  }

  // Anonymize the vote's userId field if the poll is confidential
  const voteUserId = isConfidentialPoll
    ? generateConfidentialVoteUserId(safePollId, safeUserId)
    : safeUserId;

  // Insert vote
  const voteId = crypto.randomUUID();
  const safeOption = escapeSqlLiteral(selectedOption.trim());

  const insertVoteSql = `INSERT INTO "vote" (poll_id, user_id, selected_option, created_at) VALUES ('${safePollId}', '${voteUserId}', '${safeOption}', CURRENT_TIMESTAMP)`;
  const insertVote = `
    mutation InsertVote {
      _execute(sql: ${graphqlSqlString(insertVoteSql)})
    }
  `;

  try {
    await sqlConnect.executeGraphql(insertVote);

    // Return updated vote counts
    const updatedCounts = await aggregateVotes(safePollId);
    res.status(201).json({
      message: 'Vote submitted successfully.',
      voteId,
      selectedOption: selectedOption.trim(),
      voteCounts: updatedCounts
    });
  } catch (err) {
    // SCRUM-194: Detect UNIQUE constraint violation (duplicate vote).
    if (isDuplicateVoteError(err)) {
      return res.status(409).json({
        error: 'Conflict: You have already voted on this poll.',
        code: 'DUPLICATE_VOTE'
      });
    }

    console.error('[Polls] Error submitting vote:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Failed to submit vote.' });
  }
});

// ----------------------------------------------------------
// SCRUM-193: GET /api/polls/:id/results — Get vote aggregation
// ----------------------------------------------------------
app.get('/api/polls/:id/results', adminProtect, async (req, res) => {
  const pollId = req.params.id;
  const safePollId = sanitizeUuid(pollId);

  try {
    // Get poll metadata
    const pollSql = `SELECT id, title, description, options, status, is_confidential AS "isConfidential", created_at AS "createdAt", closes_at AS "closesAt" FROM "poll" WHERE id = '${safePollId}' LIMIT 1`;
    const pollResult = await sqlConnect.executeGraphqlRead(`
      query GetPollForResults {
        _select(sql: ${graphqlSqlString(pollSql)})
      }
    `);
    const polls = (pollResult.data && pollResult.data._select) || [];
    if (polls.length === 0) {
      return res.status(404).json({ error: 'Poll not found.' });
    }
    const poll = polls[0];
    const parsedOptions = parsePollOptions(poll.options);
    const isConf = poll.isConfidential === true || poll.isConfidential === 'true' || poll.isConfidential === 1 || poll.isConfidential === 't';

    // Get total vote count
    const totalSql = `SELECT CAST(COUNT(*) AS INT) AS "total" FROM "vote" WHERE poll_id = '${safePollId}'`;
    const totalResult = await sqlConnect.executeGraphqlRead(`
      query GetTotalVotes {
        _select(sql: ${graphqlSqlString(totalSql)})
      }
    `);
    const totalRows = (totalResult.data && totalResult.data._select) || [];
    const totalVotes = totalRows.length > 0 ? Number(totalRows[0].total || 0) : 0;

    // Get per-option counts
    const voteCounts = await aggregateVotes(safePollId);

    // Build results with percentage
    const results = parsedOptions.map(option => {
      const match = voteCounts.find(v => v.option === option);
      const count = match ? Number(match.count || 0) : 0;
      const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      return { option, count, percentage };
    });

    res.json({
      poll: {
        id: poll.id,
        title: poll.title,
        description: poll.description,
        options: parsedOptions,
        status: poll.status,
        isConfidential: isConf,
        createdAt: poll.createdAt,
        closesAt: poll.closesAt
      },
      totalVotes,
      results
    });
  } catch (err) {
    console.error('[Polls] Error fetching poll results:', err.message);
    res.status(500).json({ error: 'Failed to fetch poll results.' });
  }
});

// ----------------------------------------------------------
// GET /api/polls/:id/report/csv — Download results report (admin only)
// ----------------------------------------------------------
app.get('/api/polls/:id/report/csv', adminProtect, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required.' });
  }
  const pollId = req.params.id;
  const safePollId = sanitizeUuid(pollId);

  try {
    // 1. Fetch poll details
    const pollSql = `SELECT id, title, description, options, status, is_confidential AS "isConfidential", created_at AS "createdAt", closes_at AS "closesAt" FROM "poll" WHERE id = '${safePollId}' LIMIT 1`;
    const pollResult = await sqlConnect.executeGraphqlRead(`
      query GetPollForReport {
        _select(sql: ${graphqlSqlString(pollSql)})
      }
    `);
    const polls = (pollResult.data && pollResult.data._select) || [];
    if (polls.length === 0) {
      return res.status(404).json({ error: 'Poll not found.' });
    }
    const poll = polls[0];
    const isConf = poll.isConfidential === true || poll.isConfidential === 'true' || poll.isConfidential === 1 || poll.isConfidential === 't';
    const parsedOptions = parsePollOptions(poll.options);

    // 2. Fetch vote counts
    const totalSql = `SELECT CAST(COUNT(*) AS INT) AS "total" FROM "vote" WHERE poll_id = '${safePollId}'`;
    const totalResult = await sqlConnect.executeGraphqlRead(`
      query GetTotalVotesForReport {
        _select(sql: ${graphqlSqlString(totalSql)})
      }
    `);
    const totalRows = (totalResult.data && totalResult.data._select) || [];
    const totalVotes = totalRows.length > 0 ? Number(totalRows[0].total || 0) : 0;
    const voteCounts = await aggregateVotes(safePollId);

    // 3. Fetch all staff users to verify who voted / compile audit list
    const usersSql = `SELECT id, email, display_name AS "displayName", role FROM "user" WHERE role IN ('admin', 'financial_officer', 'employee') ORDER BY display_name ASC`;
    const usersResult = await sqlConnect.executeGraphqlRead(`
      query GetUsersForReport {
        _select(sql: ${graphqlSqlString(usersSql)})
      }
    `);
    const users = (usersResult.data && usersResult.data._select) || [];

    // 4. Fetch all votes from "vote" table for matching
    const votesSql = `SELECT user_id AS "userId", selected_option AS "selectedOption", created_at AS "createdAt" FROM "vote" WHERE poll_id = '${safePollId}'`;
    const votesResult = await sqlConnect.executeGraphqlRead(`
      query GetVotesForReport {
        _select(sql: ${graphqlSqlString(votesSql)})
      }
    `);
    const votesList = (votesResult.data && votesResult.data._select) || [];

    // Compile audit records
    const auditRecords = [];
    for (const u of users) {
      const realUserId = sanitizeUuid(u.id);
      let match = null;

      if (isConf) {
        // Search by computed deterministic hash
        const hashedUserId = generateConfidentialVoteUserId(safePollId, realUserId);
        match = votesList.find(v => sanitizeUuid(v.userId) === hashedUserId);
      } else {
        // Search by direct real user ID
        match = votesList.find(v => sanitizeUuid(v.userId) === realUserId);
      }

      if (match) {
        auditRecords.push({
          name: u.displayName || 'N/A',
          email: u.email,
          role: u.role,
          voted: 'Yes',
          choice: isConf ? 'Confidential' : match.selectedOption,
          timestamp: new Date(match.createdAt).toISOString()
        });
      } else {
        auditRecords.push({
          name: u.displayName || 'N/A',
          email: u.email,
          role: u.role,
          voted: 'No',
          choice: 'N/A',
          timestamp: 'N/A'
        });
      }
    }

    // 5. Generate CSV string
    let csv = '';
    // Header section
    csv += `"Governance Poll Report"\n`;
    csv += `"Poll ID","${poll.id}"\n`;
    csv += `"Title","${poll.title.replace(/"/g, '""')}"\n`;
    csv += `"Description","${(poll.description || '').replace(/"/g, '""')}"\n`;
    csv += `"Status","${poll.status}"\n`;
    csv += `"Confidential","${isConf ? 'Yes (Anonymous)' : 'No (Public)'}"\n`;
    csv += `"Total Votes Cast","${totalVotes}"\n\n`;

    // Aggregated Results table
    csv += `"Results Summary"\n`;
    csv += `"Option","Votes Count","Percentage"\n`;
    for (const opt of parsedOptions) {
      const match = voteCounts.find(v => v.option === opt);
      const count = match ? Number(match.count || 0) : 0;
      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      csv += `"${opt.replace(/"/g, '""')}","${count}","${pct}%"\n`;
    }
    csv += `\n`;

    // Detailed Audit Log table
    csv += `"Voter Audit Log"\n`;
    csv += `"Name","Email","Role","Voted?","Selected Option","Vote Timestamp"\n`;
    for (const rec of auditRecords) {
      csv += `"${rec.name.replace(/"/g, '""')}","${rec.email.replace(/"/g, '""')}","${rec.role}","${rec.voted}","${rec.choice.replace(/"/g, '""')}","${rec.timestamp}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="poll_${safePollId}_report.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[Polls] Error generating CSV report:', err.message);
    res.status(500).json({ error: 'Failed to generate results report.' });
  }
});

// ----------------------------------------------------------
// SCRUM-191: GET /api/polls — List all polls (admin only)
// ----------------------------------------------------------
app.get('/api/polls', adminProtect, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required.' });
  }
  try {
    const sql = `SELECT id, title, description, options, status, is_confidential AS "isConfidential", created_at AS "createdAt", closes_at AS "closesAt" FROM "poll" ORDER BY created_at DESC`;
    const query = `
      query GetAllPolls {
        _select(sql: ${graphqlSqlString(sql)})
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(query);
    const polls = (result.data && result.data._select) || [];
    const enriched = await Promise.all(polls.map(async (poll) => {
      const voteCounts = await aggregateVotes(poll.id);
      const parsedOptions = parsePollOptions(poll.options);
      const isConf = poll.isConfidential === true || poll.isConfidential === 'true' || poll.isConfidential === 1 || poll.isConfidential === 't';
      return { 
        ...poll, 
        options: parsedOptions, 
        isConfidential: isConf,
        voteCounts 
      };
    }));
    res.json(enriched);
  } catch (err) {
    console.error('[Polls] Error listing all polls:', err.message);
    res.status(500).json({ error: 'Failed to list polls.' });
  }
});

// ----------------------------------------------------------
// SCRUM-191: PATCH /api/polls/:id/close — Close a poll (admin only)
// ----------------------------------------------------------
app.patch('/api/polls/:id/close', adminProtect, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Only administrators can close polls.' });
  }
  const safePollId = sanitizeUuid(req.params.id);
  try {
    const closeSql = `UPDATE "poll" SET status = 'closed' WHERE id = '${safePollId}'`;
    await sqlConnect.executeGraphql(`
      mutation ClosePoll {
        _execute(sql: ${graphqlSqlString(closeSql)})
      }
    `);
    res.json({ message: 'Poll closed successfully.' });
  } catch (err) {
    console.error('[Polls] Error closing poll:', err.message);
    res.status(500).json({ error: 'Failed to close poll.' });
  }
});

// ---------------------------------------------------------
// API: Get notifications for the logged-in user
// ---------------------------------------------------------
app.get('/api/notifications', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const query = `
      query GetNotifications($userId: UUID!) {
        notifications(where: { userId: { eq: $userId } }, orderBy: { createdAt: DESC }) {
          id
          userId
          type
          message
          isRead
          createdAt
        }
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(query, { variables: { userId } });
    const notifications = result.data && result.data.notifications ? result.data.notifications : [];
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// ---------------------------------------------------------
// API: Mark a notification as read (SCRUM-200)
// ---------------------------------------------------------
app.put('/api/notifications/:id/read', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const mutation = `
      mutation MarkAsRead($id: UUID!) {
        notification_update(id: $id, data: { isRead: true })
      }
    `;
    const result = await sqlConnect.executeGraphql(mutation, { variables: { id } });
    res.json({ success: true, notification: result.data.notification_update });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// ---------------------------------------------------------
// API: Broadcast notification to users by role (Admin only)
// ---------------------------------------------------------
app.post('/api/notifications/broadcast', authenticateJWT, async (req, res) => {
  try {
    const { message, type, roles } = req.body;
    const allowedRoles = ['admin', 'financial_officer', 'employee'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can broadcast notifications' });
    }

    // Get all users with the specified roles
    const query = `
      query GetUsersByRoles {
        users {
          id
          role
        }
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(query);
    const users = result.data && result.data.users ? result.data.users : [];
    const targetUsers = users.filter(u => roles.includes(u.role));

    // Insert notification for each target user
    const mutation = `
      mutation CreateNotification($userId: UUID!, $type: String!, $message: String!) {
        notification_insert(data: {
          user: { id: $userId },
          type: $type,
          message: $message,
          isRead: false
        })
      }
    `;

    for (const user of targetUsers) {
      const res = await sqlConnect.executeGraphql(mutation, {
        variables: { userId: user.id, type, message }
      });
      const notifId = res.data.notification_insert.id;

      const notificationObj = {
        id: notifId,
        userId: user.id,
        type,
        message,
        isRead: false,
        createdAt: new Date().toISOString()
      };

      const wsPayload = JSON.stringify({
        type: 'new_notification',
        notification: notificationObj
      });

      // send each client the notification received live
      if (wss) {
        wss.clients.forEach(client => {
          if (client.readyState === 1 && client.user && client.user.id === user.id) {
            client.send(wsPayload);
          }
        });
      }
    }

    res.json({ success: true, sent: targetUsers.length });
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    res.status(500).json({ error: 'Failed to broadcast notification' });
  }
});

// ---------------------------------------------------------
// WhatsApp Analytics Ingestion & Reporting (User Story 13)
// ---------------------------------------------------------
const whatsappJsonPath = path.join(__dirname, '../database/whatsapp_log.json');

async function insertWhatsAppLog(logData) {
  const { id, timestamp, topicCluster, sentimentScore } = logData;
  try {
    const insertMutation = `
      mutation InsertWhatsAppLog($id: UUID!, $timestamp: Timestamp!, $topicCluster: String!, $sentimentScore: Float!) {
        _execute(
          sql: "INSERT INTO \\"whats_app_log\\" (id, timestamp, topic_cluster, sentiment_score) VALUES ($1, $2, $3, $4)",
          params: [$id, $timestamp, $topicCluster, $sentimentScore]
        )
      }
    `;
    await sqlConnect.executeGraphql(insertMutation, {
      variables: {
        id,
        timestamp,
        topicCluster,
        sentimentScore
      }
    });
    console.log('[WhatsAppLog] Successfully inserted log into PostgreSQL.');
  } catch (err) {
    console.warn('[WhatsAppLog] PostgreSQL insertion failed, falling back to local JSON database:', err.message);
    // Fallback: local JSON file
    try {
      const dir = path.dirname(whatsappJsonPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      let logs = [];
      if (fs.existsSync(whatsappJsonPath)) {
        const fileContent = fs.readFileSync(whatsappJsonPath, 'utf8');
        logs = JSON.parse(fileContent || '[]');
      }
      logs.push({ id, timestamp, topicCluster, sentimentScore });
      fs.writeFileSync(whatsappJsonPath, JSON.stringify(logs, null, 2), 'utf8');
      console.log('[WhatsAppLog] Successfully inserted log into local JSON file.');
    } catch (fsErr) {
      console.error('[WhatsAppLog] Local JSON file fallback failed:', fsErr.message);
      throw fsErr;
    }
  }
}

async function getWhatsAppLogs() {
  try {
    const selectQuery = `
      query GetWhatsAppLogs {
        whatsAppLogs {
          id
          timestamp
          topicCluster
          sentimentScore
        }
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(selectQuery);
    if (result && result.data && Array.isArray(result.data.whatsAppLogs)) {
      return result.data.whatsAppLogs;
    }
    return [];
  } catch (err) {
    console.warn('[WhatsAppLog] PostgreSQL read failed, reading from local JSON database:', err.message);
    // Fallback: local JSON file
    try {
      if (fs.existsSync(whatsappJsonPath)) {
        const fileContent = fs.readFileSync(whatsappJsonPath, 'utf8');
        return JSON.parse(fileContent || '[]');
      }
      return [];
    } catch (fsErr) {
      console.error('[WhatsAppLog] Local JSON file read failed:', fsErr.message);
      return [];
    }
  }
}

// Middleware: Protect whatsapp stats (admin & employee only)
const whatsappStatsProtect = (req, res, next) => {
  let token = req.cookies && req.cookies.aldi_jwt;
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    token = req.headers['x-auth-token'];
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
    if (user.role !== 'admin' && user.role !== 'employee') {
      return res.status(403).json({ error: 'Forbidden: Access restricted to admin and employee' });
    }
    req.user = user;
    next();
  });
};

// NLP Analysis Helper for WhatsApp Messages
function analyzeWhatsAppMessage(text) {
  const t = text.toLowerCase();
  
  // 1. Topic Clustering
  let topicCluster = 'Other Inquiry';
  if (/\b(order|track|buy|purchase|cart|checkout|checkout_payment|pay|payment|receipt|refund)\b/.test(t)) {
    topicCluster = 'Order Issue';
  } else if (/\b(price|size|stock|item|product|catalog|details|spec|specification|brand|cost|costly|cheap)\b/.test(t)) {
    topicCluster = 'Product Inquiry';
  } else if (/\b(ship|deliver|delivery|address|courier|post|mail|receive|received|sent|transit|delay)\b/.test(t)) {
    topicCluster = 'Delivery Query';
  } else if (/\b(support|help|scrum|sprint|jira|confluence|meeting|minutes|vote|poll|work|member|presentation)\b/.test(t)) {
    topicCluster = 'General Support';
  }
  
  // 2. Sentiment Scoring (NLP)
  const positiveWords = ['hello', 'great', 'love', 'thanks', 'good', 'fine', 'perfect', 'awesome', 'best', 'wonderful', 'happy', 'yes', 'yup', 'calm', 'nice', 'well', 'agree', 'ready'];
  const negativeWords = ['bad', 'late', 'error', 'slow', 'hate', 'wrong', 'fail', 'failed', 'issue', 'problem', 'delay', 'delayed', 'sad', 'sorry', 'behind', 'worry', 'worried', 'ill', 'sick', 'angry', 'no', 'cannot'];
  
  let score = 0.0;
  const tokens = t.split(/\s+/);
  tokens.forEach(token => {
    const cleanToken = token.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
    if (positiveWords.includes(cleanToken)) score += 0.2;
    if (negativeWords.includes(cleanToken)) score -= 0.2;
  });
  
  score = Math.max(-1.0, Math.min(1.0, score));
  return {
    topicCluster,
    sentimentScore: Number(score.toFixed(2))
  };
}

// WhatsApp Log File Parser Helper (PII Stripped)
function parseWhatsAppLogFile(fileContent) {
  const lines = fileContent.split(/\r?\n/);
  const parsedLogs = [];
  
  // Matches "DD/MM/YYYY, HH:MM - Sender: Message" or "MM/DD/YYYY, HH:MM - Sender: Message"
  const messageRegex = /^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*-\s*([^:]+):\s*(.*)$/;
  
  lines.forEach(line => {
    const match = line.match(messageRegex);
    if (match) {
      const [_, dayStr, monthStr, yearStr, hourStr, minuteStr, sender, text] = match;
      
      let day = parseInt(dayStr, 10);
      let month = parseInt(monthStr, 10);
      let year = parseInt(yearStr, 10);
      let hour = parseInt(hourStr, 10);
      let minute = parseInt(minuteStr, 10);
      
      if (year < 100) {
        year += 2000;
      }
      
      let date;
      if (month > 12) {
        date = new Date(Date.UTC(year, day - 1, month, hour, minute));
      } else {
        date = new Date(Date.UTC(year, month - 1, day, hour, minute));
      }
      
      if (!isNaN(date.getTime())) {
        const timestamp = date.toISOString();
        const analysis = analyzeWhatsAppMessage(text);
        
        parsedLogs.push({
          id: crypto.randomUUID(),
          timestamp,
          topicCluster: analysis.topicCluster,
          sentimentScore: analysis.sentimentScore
        });
      }
    }
  });
  
  return parsedLogs;
}

// API: Upload WhatsApp Chat Log (Admin/Employee only)
app.post('/api/analytics/whatsapp/upload', whatsappStatsProtect, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // 1. Upload to Firebase Storage
    const bucket = storage.bucket();
    const uniqueFileName = `documents/${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const storageFile = bucket.file(uniqueFileName);
    await storageFile.save(file.buffer, {
      metadata: {
        contentType: 'text/plain',
      }
    });
    const fileUrl = storageFile.publicUrl();

    // 2. Insert metadata into "document" table
    const insertDocMutation = `
      mutation InsertDocument($id: UUID!, $title: String!, $category: String!, $fileUrl: String!, $uploadedById: UUID!) {
        _execute(
          sql: "INSERT INTO \\"document\\" (id, title, category, file_url, uploaded_by_id, created_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)",
          params: [$id, $title, $category, $fileUrl, $uploadedById]
        )
      }
    `;
    const docId = crypto.randomUUID();
    await sqlConnect.executeGraphql(insertDocMutation, {
      variables: {
        id: docId,
        title: `WhatsApp Chat Log - ${file.originalname}`,
        category: 'Analytics',
        fileUrl,
        uploadedById: req.user.id
      }
    });

    // 3. Parse and ingest message logs (PII Stripped)
    const fileContent = file.buffer.toString('utf8');
    const parsedLogs = parseWhatsAppLogFile(fileContent);

    // Ingest messages in parallel batches of 50
    const batchSize = 50;
    for (let i = 0; i < parsedLogs.length; i += batchSize) {
      const chunk = parsedLogs.slice(i, i + batchSize);
      await Promise.all(chunk.map(log => insertWhatsAppLog(log)));
    }

    res.status(201).json({
      message: 'WhatsApp log file uploaded, parsed, and anonymized successfully',
      documentId: docId,
      recordsIngested: parsedLogs.length
    });
  } catch (error) {
    console.error('Error in WhatsApp log upload:', error);
    res.status(500).json({ error: 'Internal server error processing file upload' });
  }
});

// Webhook endpoint: Ingest WhatsApp logs (PII Stripping enforced)
app.post('/api/analytics/whatsapp/webhook', async (req, res) => {
  try {
    const { topicCluster, sentimentScore, timestamp, id } = req.body;

    if (!topicCluster) {
      return res.status(400).json({ error: 'Missing required field: topicCluster' });
    }
    if (sentimentScore === undefined || isNaN(Number(sentimentScore))) {
      return res.status(400).json({ error: 'Missing or invalid required field: sentimentScore' });
    }

    // Stripping PII: extract ONLY the anonymized parameters
    const logId = id || crypto.randomUUID();
    const logTimestamp = timestamp || new Date().toISOString();
    const cleanLog = {
      id: logId,
      timestamp: logTimestamp,
      topicCluster,
      sentimentScore: Number(sentimentScore)
    };

    await insertWhatsAppLog(cleanLog);

    res.status(201).json({
      message: 'WhatsApp log processed and stored successfully (anonymized)',
      id: logId
    });
  } catch (error) {
    console.error('Error in WhatsApp webhook:', error);
    res.status(500).json({ error: 'Internal server error processing webhook' });
  }
});

// WhatsApp Log File Parser Helper that keeps Sender (for in-memory reporting analysis)
function parseWhatsAppLogText(fileContent) {
  const lines = fileContent.split(/\r?\n/);
  const parsedLogs = [];
  const messageRegex = /^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*-\s*([^:]+):\s*(.*)$/;

  lines.forEach(line => {
    const match = line.match(messageRegex);
    if (match) {
      const [_, dayStr, monthStr, yearStr, hourStr, minuteStr, sender, text] = match;
      
      let day = parseInt(dayStr, 10);
      let month = parseInt(monthStr, 10);
      let year = parseInt(yearStr, 10);
      let hour = parseInt(hourStr, 10);
      let minute = parseInt(minuteStr, 10);
      
      if (year < 100) {
        year += 2000;
      }
      
      let date;
      if (month > 12) {
        date = new Date(Date.UTC(year, day - 1, month, hour, minute));
      } else {
        date = new Date(Date.UTC(year, month - 1, day, hour, minute));
      }
      
      if (!isNaN(date.getTime())) {
        const timestamp = date.toISOString();
        const analysis = analyzeWhatsAppMessage(text);
        
        parsedLogs.push({
          id: crypto.randomUUID(),
          timestamp,
          sender: sender.trim(),
          text: text.trim(),
          topicCluster: analysis.topicCluster,
          sentimentScore: analysis.sentimentScore
        });
      }
    }
  });
  
  return parsedLogs;
}

// Stats reporting endpoint: Aggregate logs (protected)
app.get('/api/analytics/whatsapp/stats', whatsappStatsProtect, async (req, res) => {
  const { documentId } = req.query;
  let targetDocId = documentId;
  let targetFileUrl = null;
  let targetDocTitle = null;

  try {
    // 1. Resolve documentId. Default is 'live' (read from database logs) if not provided.
    if (targetDocId === 'latest') {
      const latestDocSql = `SELECT id, title, file_url AS "fileUrl" FROM "document" WHERE category = 'Analytics' OR title LIKE 'WhatsApp Chat Log - %' ORDER BY created_at DESC LIMIT 1`;
      const queryResult = await sqlConnect.executeGraphqlRead(`
        query GetLatestWhatsAppLogDoc {
          _select(sql: ${graphqlSqlString(latestDocSql)})
        }
      `);
      const rows = (queryResult.data && queryResult.data._select) || [];
      if (rows.length > 0) {
        targetDocId = rows[0].id;
        targetFileUrl = rows[0].fileUrl;
        targetDocTitle = rows[0].title;
      } else {
        targetDocId = 'live';
      }
    } else if (targetDocId && targetDocId !== 'live') {
      // Fetch specific document details
      const safeDocId = sanitizeUuid(targetDocId);
      const docSql = `SELECT id, title, file_url AS "fileUrl" FROM "document" WHERE id = '${safeDocId}' LIMIT 1`;
      const queryResult = await sqlConnect.executeGraphqlRead(`
        query GetWhatsAppLogDoc {
          _select(sql: ${graphqlSqlString(docSql)})
        }
      `);
      const rows = (queryResult.data && queryResult.data._select) || [];
      if (rows.length > 0) {
        targetFileUrl = rows[0].fileUrl;
        targetDocTitle = rows[0].title;
      } else {
        return res.status(404).json({ error: 'Selected chat log file not found in documents.' });
      }
    }

    // 2. Perform analysis
    let parsedMessages = [];
    let isLiveDatabase = false;

    if (targetDocId && targetDocId !== 'live' && targetFileUrl) {
      // Analyze from specific document
      const fileContent = await docCache.getDocumentContent(targetDocId, targetFileUrl);
      if (fileContent) {
        parsedMessages = parseWhatsAppLogText(fileContent);
      }
    } else {
      // Fallback: No uploads exist or requested 'live', read all logs from whats_app_log table
      const logs = await getWhatsAppLogs();
      parsedMessages = logs.map(l => ({
        id: l.id,
        timestamp: l.timestamp,
        topicCluster: l.topicCluster,
        sentimentScore: l.sentimentScore,
        sender: null // Anonymized
      }));
      isLiveDatabase = true;
    }

    // 3. Compute Aggregated Metrics
    const peakHours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    const topicMap = {};
    const senderMap = {};
    const dailyMap = {};
    const weeklyMap = {};
    const monthlyMap = {};
    let textCount = 0;
    let mediaCount = 0;
    let positiveSentiment = 0;
    let negativeSentiment = 0;
    let neutralSentiment = 0;
    let totalSentimentScore = 0;

    parsedMessages.forEach(msg => {
      // Hour aggregation
      if (msg.timestamp) {
        const date = new Date(msg.timestamp);
        const hour = date.getUTCHours();
        if (hour >= 0 && hour < 24) {
          peakHours[hour].count++;
        }

        // Date grouping for daily frequency
        const yyyymmdd = msg.timestamp.substring(0, 10);
        dailyMap[yyyymmdd] = (dailyMap[yyyymmdd] || 0) + 1;

        // Month grouping (YYYY-MM)
        const yyyymm = msg.timestamp.substring(0, 7);
        monthlyMap[yyyymm] = (monthlyMap[yyyymm] || 0) + 1;

        // Week grouping (Get ISO week)
        const target = new Date(date.valueOf());
        const dayNr = (date.getUTCDay() + 6) % 7;
        target.setUTCDate(target.getUTCDate() - dayNr + 3);
        const firstThursday = target.valueOf();
        target.setUTCMonth(0, 1);
        if (target.getUTCDay() !== 4) {
          target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
        }
        const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000);
        const year = new Date(firstThursday).getUTCFullYear();
        const weekStr = `${year}-W${String(weekNum).padStart(2, '0')}`;
        weeklyMap[weekStr] = (weeklyMap[weekStr] || 0) + 1;
      }

      // Topic cluster aggregation
      const topic = msg.topicCluster || 'Unknown';
      topicMap[topic] = (topicMap[topic] || 0) + 1;

      // Sender aggregation
      if (msg.sender) {
        senderMap[msg.sender] = (senderMap[msg.sender] || 0) + 1;
      }

      // Message Type classification
      if (!isLiveDatabase && msg.text && /<media omitted>/i.test(msg.text)) {
        mediaCount++;
      } else {
        textCount++;
      }

      // Sentiment Classification
      const score = msg.sentimentScore || 0;
      totalSentimentScore += score;
      if (score > 0) {
        positiveSentiment++;
      } else if (score < 0) {
        negativeSentiment++;
      } else {
        neutralSentiment++;
      }
    });

    const averageSentiment = parsedMessages.length > 0 ? Number((totalSentimentScore / parsedMessages.length).toFixed(2)) : 0;

    // Format Topic Clusters
    const topicClusters = Object.entries(topicMap).map(([topicCluster, count]) => ({
      topicCluster,
      count
    })).sort((a, b) => b.count - a.count);

    // Active Users (Top 5 / Bottom 5)
    const sortedSenders = Object.entries(senderMap).map(([name, count]) => ({
      name,
      count
    })).sort((a, b) => b.count - a.count);

    const mostActiveUsers = sortedSenders.slice(0, 5);
    const leastActiveUsers = [...sortedSenders].reverse().slice(0, 5);

    // Format Frequencies
    const dailyFrequency = Object.entries(dailyMap).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
    const weeklyFrequency = Object.entries(weeklyMap).map(([week, count]) => ({ week, count })).sort((a, b) => a.week.localeCompare(b.week));
    const monthlyFrequency = Object.entries(monthlyMap).map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month));

    // Calculate Averages
    const dailyCount = dailyFrequency.length;
    const weeklyCount = weeklyFrequency.length;
    const monthlyCount = monthlyFrequency.length;
    const totalMsgs = parsedMessages.length;

    const averages = {
      daily: dailyCount > 0 ? Number((totalMsgs / dailyCount).toFixed(1)) : 0,
      weekly: weeklyCount > 0 ? Number((totalMsgs / weeklyCount).toFixed(1)) : 0,
      monthly: monthlyCount > 0 ? Number((totalMsgs / monthlyCount).toFixed(1)) : 0
    };

    res.json({
      peakHours,
      topicClusters,
      mostActiveUsers,
      leastActiveUsers,
      frequency: {
        daily: dailyFrequency,
        weekly: weeklyFrequency,
        monthly: monthlyFrequency
      },
      averages,
      messageTypes: {
        text: textCount,
        media: mediaCount
      },
      sentimentDistribution: {
        positive: positiveSentiment,
        negative: negativeSentiment,
        neutral: neutralSentiment
      },
      averageSentiment,
      isLiveDatabase,
      selectedDocument: targetDocId && targetDocId !== 'live' ? { id: targetDocId, title: targetDocTitle } : { id: 'live', title: 'Live Database Logs (Anonymized)' }
    });
  } catch (error) {
    console.error('Error fetching WhatsApp stats:', error);
    res.status(500).json({ error: 'Internal server error fetching statistics' });
  }
});

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
    const displayRole = user.role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    console.log(`[WebSocket] ${displayRole} client connected: ${user.email}`);

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

// ---------------------------------------------------------
// API: Admin — Restock (create StockBatch rows + sync product stock)
// Allowed: admin, financial_officer, employee  (all via adminProtect)
// ---------------------------------------------------------
app.post('/api/admin/restock', adminProtect, async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required and must be non-empty.' });
  }

  const results = [];
  const errors  = [];

  for (const item of items) {
    const { productId, quantity, piecePrice, expiryDate } = item;

    if (!productId || !quantity || quantity <= 0 || !expiryDate) {
      errors.push({ productId, error: 'Missing or invalid fields (productId, quantity, expiryDate are required).' });
      continue;
    }

    try {
      // 1. Insert a new StockBatch
      const insertMutation = `
        mutation InsertStockBatch(
          $productId: UUID!
          $qty: Int!
          $price: Float!
          $expiry: Date!
        ) {
          stockBatch_insert(data: {
            product: { id: $productId }
            initialQuantity: $qty
            currentQuantity: $qty
            piecePrice: $price
            expiryDate: $expiry
          })
        }
      `;

      const insertResult = await sqlConnect.executeGraphql(insertMutation, {
        variables: {
          productId,
          qty: Number(quantity),
          price: Number(piecePrice || 0),
          expiry: expiryDate
        }
      });

      const batchId = insertResult.data?.stockBatch_insert?.id;

      // 2. Re-compute total stock across all batches for this product
      const newTotal = await getProductStock(productId);

      // 3. Update the product's stockQuantity to the new total
      const updateMutation = `
        mutation UpdateProductStock($productId: UUID!, $stock: Int!) {
          product_update(id: $productId, data: { stockQuantity: $stock })
        }
      `;
      await sqlConnect.executeGraphql(updateMutation, {
        variables: { productId, stock: newTotal }
      });

      results.push({ productId, batchId, newTotal });
    } catch (err) {
      console.error(`[Restock] Failed for product ${productId}:`, err.message);
      errors.push({ productId, error: err.message });
    }
  }

  return res.status(errors.length === items.length ? 500 : 200).json({
    inserted: results.length,
    results,
    errors
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

module.exports = { app, server, aggregateVotes };
