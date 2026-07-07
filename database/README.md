# Database Directory

This directory contains database configurations and schema descriptions for the ALDI E-Commerce System. The system has migrated to **Firebase Data Connect** for a unified, modern, and robust database architecture.

## Unified Database Migration

We use Firebase Data Connect. The database schema is defined using GraphQL schemas matching Firebase Data Connect's data definition language (DDL).


---

## Data Schema (Firebase Data Connect)

Below is the GraphQL schema representing the core entities: `User`, `Product`, `Cart`, `CartItem`, `Order`, `OrderItem`, `FinancialRecord`, `Document`, `Poll`, and `Vote`.

```graphql
type User @table {
  email: String! @unique
  passwordHash: String!
  role: String! @default(value: "customer") 
  createdAt: Timestamp! @default(expr: "request.time")
  updatedAt: Timestamp! @default(expr: "request.time") 
  lastLogin: Timestamp
  displayName: String!
  phoneNumber: String
  address: String
  photoUrl: String
}

type Product @table {
  name: String!
  category: String! 
  price: Float!
  description: String
  imageUrl: String
  updatedAt: Timestamp! @default(expr: "request.time") 
}

type Cart @table {
  user: User!
  updatedAt: Timestamp! @default(expr: "request.time") 
}

type CartItem @table {
  cart: Cart!
  product: Product!
  quantity: Int!
}

type Order @table {
  user: User!
  totalAmount: Float!
  status: String! @default(value: "pending") 
  createdAt: Timestamp! @default(expr: "request.time")
  updatedAt: Timestamp! @default(expr: "request.time") 
}

type OrderItem @table {
  order: Order!
  product: Product!
  priceAtPurchase: Float!
  quantity: Int!
}

type FinancialRecord @table {
  transactionId: String! @unique
  amount: Float!
  transactionType: String! @default(value: "ecommerce_sale")
  relatedOrder: Order # Links directly to the checkout flow
  processedBy: User # Links to the Financial Officer managing the record
  description: String
  createdAt: Timestamp! @default(expr: "request.time")
}

type Document @table {
  title: String!
  category: String!
  fileUrl: String!
  uploadedBy: User
  createdAt: Timestamp! @default(expr: "request.time")
}

type StockBatch @table {
  product: Product!
  initialQuantity: Int!
  currentQuantity: Int!
  expiryDate: Timestamp!
  receivedAt: Timestamp! @default(expr: "request.time")
}

type Notification @table {
  user: User!
  type: String!
  message: String!
  isRead: Boolean! @default(value: false)
  createdAt: Timestamp! @default(expr: "request.time")
}

type Poll @table {
  title: String!
  description: String! @default(value: "")
  options: String! @default(value: "[]")
  status: String! @default(value: "open")
  createdAt: Timestamp! @default(expr: "request.time")
  closesAt: Timestamp
}

type Vote @table(key: ["poll", "userId"]) {
  poll: Poll!
  userId: UUID!
  selectedOption: String!
  createdAt: Timestamp! @default(expr: "request.time")
}
```

---

## Entity Details

### 1. User Table
Stores user account profiles, authentication hashes, and roles.

| Field | Type | Attributes / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` / `ID` | Primary Key (auto-generated) | Unique identifier for each user |
| `email` | `String!` | `@unique` | Indexed user email address (must be unique) |
| `passwordHash` | `String!` | | Securely hashed user password |
| `role` | `String!` | `@default(value: "customer")` | Predefined text access level/role (`customer`, `admin`, `employee`, `financial_officer`) |
| `createdAt` | `Timestamp!` | `@default(expr: "request.time")` | Record creation timestamp |
| `updatedAt` | `Timestamp!` | `@default(expr: "request.time")` | Record last updated timestamp |
| `lastLogin` | `Timestamp` | | Timestamp of the user's most recent login |
| `displayName` | `String!` | | User's full name/display name |
| `phoneNumber` | `String` | | Contact phone number |
| `address` | `String` | | Shipping and billing address details |
| `photoUrl` | `String` | | URL to the user's uploaded profile photo |

### 2. Product Table
Catalog items available in the ALDI E-Commerce System.

| Field | Type | Attributes / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` / `ID` | Primary Key (auto-generated) | Unique identifier for each product |
| `name` | `String!` | | Name of the product |
| `category` | `String!` | | Category/department (e.g., `"Snacks & Candy"`) |
| `price` | `Float!` | | Unit price in Euros (€) |
| `stockQuantity` | `Int!` | | Current stock count available |
| `description` | `String` | | Description of the product features, ingredients, etc. |
| `imageUrl` | `String` | | Path or URL to the product image asset |
| `updatedAt` | `Timestamp!` | `@default(expr: "request.time")` | Last updated timestamp |

### 3. Cart Table
Maintains active shopping cart references for users.

| Field | Type | Attributes / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` / `ID` | Primary Key (auto-generated) | Unique identifier for the cart |
| `user` | `User!` | Foreign Key Reference | The user owning this shopping cart |
| `updatedAt` | `Timestamp!` | `@default(expr: "request.time")` | Timestamp of last cart update |

### 4. CartItem Table
Represents individual items added to a specific user's shopping cart.

| Field | Type | Attributes / Default | Description |
| :--- | :--- | :--- | :--- |
| `cart` | `Cart!` | Relation Reference | Associated cart reference |
| `product` | `Product!` | Relation Reference | Associated product reference |
| `quantity` | `Int!` | | Amount of this product in the cart |

### 5. Order Table
Tracks checkout transactions.

| Field | Type | Attributes / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` / `ID` | Primary Key (auto-generated) | Unique order tracking identifier |
| `user` | `User!` | Relation Reference | The user who placed the order |
| `totalAmount` | `Float!` | | Total order cost in Euros (€) |
| `status` | `String!` | `@default(value: "pending")` | Predefined text status state (`pending`, `processing`, `shipped`, `delivered`, `cancelled`) |
| `createdAt` | `Timestamp!` | `@default(expr: "request.time")` | Order placement timestamp |
| `updatedAt` | `Timestamp!` | `@default(expr: "request.time")` | Order details updated timestamp |

### 6. OrderItem Table
Line items matching products to specific checkout transactions.

| Field | Type | Attributes / Default | Description |
| :--- | :--- | :--- | :--- |
| `order` | `Order!` | Relation Reference | Associated checkout order |
| `product` | `Product!` | Relation Reference | Associated product purchased |
| `priceAtPurchase` | `Float!` | | Unit price locked at the time of purchase |
| `quantity` | `Int!` | | Quantity of item purchased |

### 7. FinancialRecord Table
Tracks monetary transactions for financial audits.

| Field | Type | Attributes / Default | Description |
| :--- | :--- | :--- | :--- |
| `transactionId` | `String!` | `@unique` | Unique transaction reference |
| `amount` | `Float!` | | Transaction value |
| `transactionType` | `String!` | `@default(value: "ecommerce_sale")` | Predefined text type of transaction (`"ecommerce_sale"`, `"membership_due"`, `"operational_cost"`) |
| `relatedOrder` | `Order` | Relation Reference | Associated checkout order (optional) |
| `processedBy` | `User` | Relation Reference | Financial Officer who processed the record (optional) |
| `description` | `String` | | Description of the financial entry |
| `createdAt` | `Timestamp!` | `@default(expr: "request.time")` | Creation timestamp |

### 8. Document Table
Stores metadata for uploaded corporate and operational documents.

| Field | Type | Attributes / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` / `ID` | Primary Key (auto-generated) | Unique identifier for the document |
| `title` | `String!` | | The human-readable title of the document |
| `category` | `String!` | | The category/classification of the document |
| `fileUrl` | `String!` | | Path or URL to the securely uploaded file |
| `uploadedBy` | `User` | Relation Reference | The user (admin/employee) who uploaded the document |
| `createdAt` | `Timestamp!` | `@default(expr: "request.time")` | Document upload timestamp |

### 9. Poll Table
Stores internal governance and strategy polls for staff users.

| Field | Type | Attributes / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` / `ID` | Primary Key | Unique identifier for each poll |
| `title` | `String!` | | Poll headline shown in the dashboard |
| `description` | `String!` | `""` | Optional context for voters |
| `options` | `JSONB` / JSON array string | `[]` | Multiple-choice options |
| `status` | `String!` | `open` | Poll lifecycle status |
| `createdAt` | `Timestamp!` | current timestamp | Poll creation timestamp |
| `closesAt` | `Timestamp` | nullable | Optional vote deadline |

### 10. Vote Table
Stores staff votes and enforces one vote per user per poll.

| Field | Type | Attributes / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` / `ID` | Primary Key | Unique identifier for each vote |
| `pollId` | `UUID` | Foreign Key to `Poll` | Poll being voted on |
| `userId` | `UUID` | Unique with `pollId` | Staff user who voted |
| `selectedOption` | `String!` | | Chosen poll option |
| `createdAt` | `Timestamp!` | current timestamp | Vote creation timestamp |

---

## Database Scripts and Tools

The following Node.js helper scripts are located in the `database/` directory and can be executed via Node.js to manage database records and query statuses:

### 1. Mock Users Seeding
To populate the SQL database with a set of mock users for login testing, run:
```bash
node database/seed.js
```
This wipes all existing users and inserts exactly 10 mock users with standardized credentials:
* **Admin**: `admin@aldi-mock.com` (password: `adminPassword123`)
* **Financial Officer**: `financial@aldi-mock.com` (password: `financialPassword123`)
* **Employee**: `employee@aldi-mock.com` (password: `employeePassword123`)
* **Customers**: `customer_1@aldi-mock.com` through `customer_7@aldi-mock.com` (passwords: `customerPassword1` through `customerPassword7`)

### 2. Product Catalog Seeding
To wipe the catalog and seed products from the system's product schema, run:
```bash
node database/seed-products.js
```
This script wipes the database product table and populates it with default catalog items.

### 3. List Registered Users
To query the database and quickly print a list of all registered users (showing ID, Email, Role, and Display Name), run:
```bash
node database/list-users.js
```

### 4. Schema Introspection
To inspect the database structure and print out active schema types and tables registered in Firebase Data Connect, run:
```bash
node database/inspect-schema.js
```
