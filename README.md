# Aldi E-Commerce System

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

## Backend Setup (FastAPI)

1. Navigate to the backend directory and set up a virtual environment:
   ```bash
   cd backend
   python -m venv .venv
   ```

2. Activate the virtual environment:
   - **Windows (PowerShell):**
     ```powershell
     .venv\Scripts\Activate.ps1
     ```
   - **macOS/Linux:**
     ```bash
     source .venv/bin/activate
     ```

3. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the FastAPI development server (run this from the **project root directory**):
   ```bash
   cd ..
   uvicorn backend.main:app --reload
   ```
   The API will be available at `http://127.0.0.1:8000`. The interactive OpenAPI docs are accessible at `http://127.0.0.1:8000/docs`.

---

## Frontend Setup (Vite)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend application will be served at the URL printed in the terminal (typically `http://localhost:5173`).

---

## IDE Configuration (VS Code)

To get the best development experience and proper diagram rendering:

1. **Python Environment**:
   - When prompted, choose **Python: Select Interpreter** and select the interpreter inside `backend/.venv` to ensure autocomplete and linting resolve correctly.

2. **Recommended Extensions**:
   - **Python** (Microsoft): For full Python language support, testing, and IntelliSense.
   - **Markdown Preview Mermaid Support** (Matt Bierner): Required to render the flow and architecture diagrams located in [docs/architecture.md](file:///e:/projects/antigravity/aldi-ecommerce-system/docs/architecture.md).
