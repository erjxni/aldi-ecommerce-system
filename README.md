# Aldi E-Commerce System

// changes
Integrated ALDI E-Commerce System featuring registration and login capabilities.

## Project Structure

This project is organized into several distinct directories. For a detailed breakdown of the specific files within each, please refer to their respective `README.md` files:

- **[`backend/`](backend/README.md)**: Contains the main FastAPI application, SQLAlchemy database models, validation schemas, and API endpoints.
- **[`database/`](database/README.md)**: Contains ETL migration scripts, mock data generators, and raw SQL schemas.
- **[`docs/`](docs/README.md)**: Contains project architecture documentation and system flow diagrams.
- **[`frontend/`](frontend/README.md)**: Contains the Vite-powered Vanilla JS, HTML, and CSS application.
- **[`legacy/`](legacy/README.md)**: Serves as an archive for old prototypes (e.g., Flask login story, Express servers) and configurations.
- **[`scratch/`](scratch/README.md)**: A temporary workspace for experimental code, drafts, and UI component documentation.
- **[`tests/`](tests/README.md)**: Reserved for automated unit, integration, and end-to-end testing suites.

## Prerequisites

- **Python 3.10+**
- **Node.js & npm**

---

## Setup

1. Navigate to the root
2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

---

## IDE Configuration (VS Code)

To get the best development experience and proper diagram rendering:

1. **Recommended Extensions**:
   - **Python** (Microsoft): For full Python language support, testing, and IntelliSense.
   - **Markdown Preview Mermaid Support** (Matt Bierner): Required to render the flow and architecture diagrams located in [docs/architecture.md](file:///e:/projects/antigravity/aldi-ecommerce-system/docs/architecture.md).
