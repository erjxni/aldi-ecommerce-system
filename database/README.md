# Database Directory

This directory contains database configurations and schema descriptions for the ALDI E-Commerce System. The system has migrated to **Firebase Data Connect** for a unified, modern, and robust database architecture.

## Unified Database Migration

We have moved from a local SQLite database to Firebase. The database schema is defined using GraphQL schemas matching Firebase Data Connect's data definition language (DDL).

---

## Data Schema (Firebase Data Connect)

Below is the GraphQL schema representing the core entities: `User`, `Product`, `Cart`, `CartItem`, `Order`, and `OrderItem`.

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
}

type Product @table {
  name: String!
  category: String!
  price: Float!
  stockQuantity: Int!
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
| `role` | `String!` | `@default(value: "customer")` | Access level/role (e.g., `"customer"`, `"admin"`) |
| `createdAt` | `Timestamp!` | `@default(expr: "request.time")` | Record creation timestamp |
| `updatedAt` | `Timestamp!` | `@default(expr: "request.time")` | Record last updated timestamp |
| `lastLogin` | `Timestamp` | | Timestamp of the user's most recent login |
| `displayName` | `String!` | | User's full name/display name |
| `phoneNumber` | `String` | | Contact phone number |
| `address` | `String` | | Shipping and billing address details |

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
| `status` | `String!` | `@default(value: "pending")` | Status state (`"pending"`, `"completed"`, `"cancelled"`) |
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