# Backend Directory

This directory contains the Node.js Express backend application for the ALDI E-Commerce System. It serves static assets, provides RESTful endpoints, broadcasts real-time updates via WebSockets, and interfaces with Firebase Data Connect.

## Core Files

* **[`server.js`](file:///e:/projects/antigravity/aldi-ecommerce-system/backend/server.js)**: The main entry point. Sets up the HTTP server, WebSocketServer, CORS, cookie parsing, route definitions, and error handling.
* **[`db.js`](file:///e:/projects/antigravity/aldi-ecommerce-system/backend/db.js)**: Initializes the Firebase Admin SDK using the project credentials and exports the SQL Connect (`getDataConnect`) client.

---

## Authentication & Authorization

The system utilizes JSON Web Tokens (JWT) for secure authentication.

### Middleware

1. **`authenticateJWT`**
   - Extracts and verifies the JWT token from the `Authorization: Bearer <token>` header, the `x-auth-token` header, the `token` query parameter, or the `aldi_jwt` cookie.
   - Decodes the payload and attaches user details to `req.user`.

2. **`adminProtect`**
   - Specifically protects `/admin.html` and `/api/admin/*` endpoints.
   - Extracts the JWT from the `aldi_jwt` HttpOnly cookie.
   - Validates that the user has a staff role (`admin`, `financial_officer`, or `employee`).
   - If authorization fails, it returns a detailed 403 Forbidden page or JSON response. If the session is missing, it redirects to the login screen.

---

## API Endpoints

### Public / Customer Routes

* **`GET /api/products`**: Lists all products fetched from the database.
* **`GET /api/products/:id`**: Returns details of a specific product by ID.
* **`POST /api/register`**: Registers a new customer account.
* **`POST /api/login`**: Authenticates a user. On success:
  - Sets the `aldi_jwt` token as an `HttpOnly`, `Lax` cookie.
  - Updates the `lastLogin` timestamp in the database.
  - Returns user profile data and the JWT token.
* **`POST /api/logout`**: Clears the `aldi_jwt` cookie.
* **`POST /api/checkout`**: (Authenticated) Processes shopping cart checkouts:
  - Performs multi-step insertion: `Order` $\to$ `OrderItem`s $\to$ `FinancialRecord`.
  - If the `FinancialRecord` insertion fails (e.g. key collision), a rollback runs to delete the created `OrderItems` and `Order` to prevent orphan database data.
  - On checkout success, broadcasts details to active admin WebSocket connections.

### Protected Admin Routes (`/api/admin/*`)

* **`GET /api/admin/sales-losses`**: Computes and returns mock weekly sales loss trends and analytics for dashboard charts.
* **`GET /api/admin/customers`**: Retrieves a list of system users. Supports text searching by email or name.

---

## WebSocket Server

* **Port**: Runs concurrently on the same port as the HTTP Express app (default: `3000`).
* **Authentication**: Connection URL must include `?token=<JWT_TOKEN>`. The connection is closed with a `4001` or `4003` status code if the token is missing or unauthorized.
* **Broadcasting**: Sends a `financial_update` JSON message containing transaction amounts and order IDs to connected clients whenever a checkout is successfully completed.