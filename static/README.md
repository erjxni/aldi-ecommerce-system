# Static Frontend Directory

This directory contains the client-side files for the ALDI E-Commerce System, which are served statically by the Express backend. The user interface features premium styling, harmonious dark/glassmorphic themes, and responsive design layouts.

## Pages

* **[`index.html`](file:///e:/projects/antigravity/aldi-ecommerce-system/static/index.html)**: The home landing page of the store, introducing ALDI's premium catalog.
* **[`products.html`](file:///e:/projects/antigravity/aldi-ecommerce-system/static/products.html)**: The catalog browser page where users can browse, search, filter, and add items to their shopping cart.
* **[`product-detail.html`](file:///e:/projects/antigravity/aldi-ecommerce-system/static/product-detail.html)**: Provides a dedicated detail card view for individual products, showing descriptions, pricing, and stock levels.
* **[`login.html`](file:///e:/projects/antigravity/aldi-ecommerce-system/static/login.html)**: Features authentication options, hosting both login and sign-up/registration forms.
* **[`checkout.html`](file:///e:/projects/antigravity/aldi-ecommerce-system/static/checkout.html)**: Shopping cart review page allowing customers to fill in shipping info and submit an order checkout payload to the backend.
* **[`order-confirmation.html`](file:///e:/projects/antigravity/aldi-ecommerce-system/static/order-confirmation.html)**: Displays the order number, total amount paid, and shipping address details after a successful checkout.
* **[`admin.html`](file:///e:/projects/antigravity/aldi-ecommerce-system/static/admin.html)**: A protected administrative panel containing:
  - **Financial Metrics & Losses**: Glassmorphic analytics charts illustrating weekly transaction losses trends and item classifications.
  - **User & Customer Directory**: Searchable list of registered system users, detailing names, emails, roles, and creation timestamps.
  - **Real-time WebSocket Events Feed**: An activity feed displaying checkout events pushed from the server in real-time.

## Assets & Styles

* **[`css/style.css`](file:///e:/projects/antigravity/aldi-ecommerce-system/static/css/style.css)**: Implements custom HSL variables based on official ALDI brand guidelines. Standardizes glassmorphic panels (`backdrop-filter: blur`), dark-theme styling, visual hover transitions, and layout micro-animations.
* **`js/`**
  - **[`main.js`](file:///e:/projects/antigravity/aldi-ecommerce-system/static/js/main.js)**: Handles global e-commerce systems, API fetching, cart state management (stored in `localStorage`), and authentication header injection.
  - **[`login.js`](file:///e:/projects/antigravity/aldi-ecommerce-system/static/js/login.js)**: Contains form field validators, UI registration flows, and direct token authentication handlers.
* **`assets/`**
  - **`images/`**: Contains optimized images of the product items (beef salami, dark chocolate, sourdough bread, etc.) and brand logos.
  - **`public/`**: Stores static assets such as system favicons, icons, and the Progressive Web App configuration file (`site.webmanifest`).
