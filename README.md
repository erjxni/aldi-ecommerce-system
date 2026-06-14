# Aldi E-Commerce System

Integrated ALDI E-Commerce System featuring registration and login capabilities.

## Project Structure

- **`frontend/`**: Vanilla JS, HTML, and CSS application powered by Vite.
- **`backend/`**: FastAPI backend utilizing SQLite for storage and SQLAlchemy for ORM.
- **`legacy/`**: Contains legacy prototypes and previously used configurations (e.g., Flask login prototype, old Express setup).

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
