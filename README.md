# Aldi E-Commerce System

Integrated ALDI E-Commerce System featuring registration and login capabilities.

## Project Structure

- **`frontend/`**: Vanilla JS, HTML, and CSS application powered by Vite.
- **`backend/`**: FastAPI backend utilizing SQLite for storage and SQLAlchemy for ORM.
- **Flask Login Prototype**: A Flask-based standalone user story prototype (`app.py`).

## Prerequisites

- **Python 3.10+**
- **Node.js & npm**

---

## FastAPI/Vite Setup (Main System)

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv .venv
   ```

3. Activate the virtual environment:
   - **Windows (PowerShell):**
     ```powershell
     .venv\Scripts\Activate.ps1
     ```
   - **macOS/Linux:**
     ```bash
     source .venv/bin/activate
     ```

4. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

5. Run the FastAPI development server (run this from the **project root directory**):
   ```bash
   uvicorn backend.main:app --reload
   ```
   The API will be available at `http://127.0.0.1:8000`. The interactive OpenAPI docs are accessible at `http://127.0.0.1:8000/docs`.

### Frontend Setup

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

## Flask Login User Story Prototype Setup

This workspace also contains a standalone Flask-based implementation for the user story:
> As a user, I want to log in with my email and password so that I can access my account securely.

To run the Flask prototype:

1. Create and activate a virtual environment in the project root:
   ```bash
   python -m venv .venv
   .venv\Scripts\Activate.ps1   # Windows
   source .venv/bin/activate    # macOS/Linux
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Start the Flask application:
   ```bash
   python app.py
   ```

4. Open `http://127.0.0.1:5000` in your browser.

### Demo Accounts
- **Student**: `student@example.com` / `Password123`
- **Admin**: `admin@example.com` / `Admin123`

---

## IDE Configuration (VS Code)

To get the best development experience and proper diagram rendering:

1. **Python Environment**:
   - When prompted, choose **Python: Select Interpreter** and select the interpreter inside `backend/.venv` to ensure autocomplete and linting resolve correctly.

2. **Recommended Extensions**:
   - **Python** (Microsoft): For full Python language support, testing, and IntelliSense.
   - **Markdown Preview Mermaid Support** (Matt Bierner): Required to render the flow and architecture diagrams located in [docs/architecture.md](file:///e:/projects/antigravity/aldi-ecommerce-system/docs/architecture.md).
