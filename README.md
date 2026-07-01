# ALDI E-Commerce System

An integrated, premium E-Commerce System styled with modern dark glassmorphism layout, featuring user registration, role-based login capabilities, custom cart administration, real-time WebSocket checkouts, and transactional database integrity.

---

## Project Structure

This project is organized into several distinct directories. For a detailed breakdown of the files and systems within each, refer to their respective `README.md` files:

* **[`backend/`](backend/README.md)**: Contains the Express backend application, JWT token-based authentication middlewares, API routing, and WebSocket telemetry server.
* **[`database/`](database/README.md)**: Contains Firebase Data Connect GraphQL schema descriptions, configuration records, and database scripting tools (seeding, introspecting schemas, and listing users).
* **[`static/`](static/README.md)**: Holds the client-side frontend files (HTML views, vanilla CSS stylesheet, and core JS modules) served by Express.
* **[`docs/`](docs/README.md)**: Houses comprehensive system architecture blueprints and registration/checkout workflow sequence diagrams.
* **[`tests/`](tests/README.md)**: Contains the integration test suite validating database connection status, operational permissions, and transaction rollbacks.

---

## Prerequisites

* **Node.js (v18.0.0+)**
* **npm**

---

## Setup & Running

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```
   The backend server will launch on port `3000`, serving the static pages at `http://localhost:3000`.

3. **Run database integration tests**:
   ```bash
   npm test
   ```

---

## IDE Configuration (VS Code)

To get the best development experience and proper diagram rendering:

1. **Recommended Extensions**:
   - **Markdown Preview Mermaid Support** (Matt Bierner): Required to render the system flows and sequence diagrams in [docs/architecture.md](docs/architecture.md).

## Disclaimer
> This project was created solely for educational purposes. All Aldi brands, logos, and assets used in this project are the intellectual property of Aldi. No copyright infringement is intended, and no profit was made from this work.
