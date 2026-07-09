# ALDI E-Commerce & Staff Governance System

An integrated, premium enterprise platform styled with a modern professional layout. The application functions as a unified customer storefront and a staff management portal. It features user registration, role-based login capabilities, custom cart administration, real-time WebSocket checkouts, transactional database integrity, secure file storage, analytical dashboards, and an internal staff polling system.

---

## Key Features

### Customer Storefront
* **Product Catalog**: Live search, category-based tabs, and responsive grids.
* **Product Details**: Dynamic template injection with feature specifications and real-time stock batch availability.
* **Persistent Cart**: Unified cart synchronization using client-side local storage for guests and server-side persistent database states for logged-in users.
* **FIFO Checkout**: Custom stock deduction adhering to First-In, First-Out (FIFO) batch principles, complete with atomic transactions and automatic stock rollbacks.

### Staff Management Portal
* **Sales Analytics**: Visualization of sales losses, waste percentage, categories (e.g. expired products, damaged goods), and weekly trends.
* **User Administration**: Control profiles, roles, and profile pictures for administrators, employees, and financial officers.
* **Secure Cloud Repository**: File upload and download for operational documents (Governance, E-Commerce), protected by role-based access control.
* **Governance Polls**: Live internal strategy polls. Admins can create polls, staff members can vote, and results are aggregated with automatic duplicate vote detection.

---

## Project Structure

Refer to the respective subdirectories for more details:

* **[`backend/`](backend/README.md)**: Express backend server managing routing, JWT validation middlewares, WebSockets, and database operations.
* **[`database/`](database/README.md)**: Firebase Data Connect schemas and seeding scripts (`seed.js` for users, `seed-products.js` for catalog/batches).
* **[`static/`](static/README.md)**: Modern customer storefront pages (`index.html`, `products.html`, `checkout.html`) and the staff dashboard (`admin.html`) built with native CSS and vanilla JS modules.
* **[`docs/`](docs/README.md)**: Visual sequence diagrams and system architecture blueprints.
* **[`tests/`](tests/README.md)**: Automated integration test suite validating database connection state and checkout logic.

---

## Technical Stack
* **Database**: Firebase Data Connect backed by Google Cloud SQL for PostgreSQL.
* **Backend**: Node.js & Express, cookie-based JWT sessions, raw SQL query options (`_execute`/`_select` via Data Connect GraphQL mutations).
* **WebSockets**: WSS server notifying admin dashboards of transaction metrics and financial activities in real time.
* **Frontend**: Vanilla HTML5/CSS3 with premium HSL-based styles and client-side modules.

---

## Setup & Execution

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Seed Database Tables**:
   * To seed standard staff credentials and customer accounts:
     ```bash
     node database/seed.js
     ```
   * To seed the catalog and populate initial FIFO stock batches:
     ```bash
     node database/seed-products.js
     ```

3. **Launch the Server**:
   ```bash
   npm run dev
   ```
   The application runs on `http://localhost:3001` (static page hosting and API endpoints) and establishes WebSocket channels.

4. **Run Integration Tests**:
   ```bash
   npm test
   ```

---

## Disclaimer
> This project was created solely for educational purposes. All Aldi brands, logos, and assets used in this project are the intellectual property of Aldi. No copyright infringement is intended, and no profit was made from this work.

