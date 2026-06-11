# Aldi E-Commerce System

Integrated ALDI E-Commerce System featuring registration and login capabilities.

## Project Structure

- **`frontend/`**: Vanilla JS, HTML, and CSS application powered by Vite.
- **`backend/`**: FastAPI backend utilizing SQLite for storage and SQLAlchemy for ORM.

## Prerequisites

- **Python 3.10+**
- **Node.js & npm**

---

## Backend Setup

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

5. Run the FastAPI development server:
   ```bash
   uvicorn main:app --reload
   ```
   The API will be available at `http://127.0.0.1:8000`. The interactive OpenAPI docs are accessible at `http://127.0.0.1:8000/docs`.

---

## Frontend Setup

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

To ensure that code linting and autocomplete work correctly:
- The project root contains a `.vscode/settings.json` file that points VS Code's Python extension to the correct virtual environment path (`backend/.venv`) and adds `./backend` to the analysis path.
- When prompted in VS Code, choose **Python: Select Interpreter** and select the interpreter inside `backend/.venv`.
