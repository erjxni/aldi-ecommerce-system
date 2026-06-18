import csv
import sqlite3
import os
from datetime import datetime
from dotenv import load_dotenv

# Load secure environment configuration
load_dotenv()

# =====================================================================
# 1. TRANSFORMATION & CLEANING LAYER
# =====================================================================

def standardize_date(date_str):
    """
    Parses various messy date formats and outputs a strict standard: YYYY-MM-DD HH:MM:SS
    """
    date_str = date_str.strip()
    # List of possible formats found in legacy systems
    formats = [
        "%m/%d/%Y",  # 05/12/2022
        "%Y.%m.%d",  # 2023.01.15
        "%Y-%m-%d",  # 2022-12-05
        "%d-%b-%Y"   # 14-Feb-2024
    ]
    
    for fmt in formats:
        try:
            parsed_date = datetime.strptime(date_str, fmt)
            return parsed_date.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
            
    # If no formats match, raise an exception to alert the main pipeline
    raise ValueError(f"Unrecognized date format: '{date_str}'")


def clean_and_validate_record(row):
    """
    Validates essential fields and strips whitespace/applies fallbacks.
    """
    email = row.get('email', '').strip().lower()
    if not email:
        raise ValueError("Critical field missing: 'email' cannot be empty.")
        
    clean_date = standardize_date(row.get('signup_date', ''))
    
    phone = row.get('phone', '').strip()
    if not phone or phone.lower() in ["n/a", "unknown"]:
        phone = "Unknown"
        
    return {
        "name": row.get('name', '').strip(),
        "email": email,
        "signup_date": clean_date,
        "phone": phone
    }

# =====================================================================
# 2. IN-MEMORY DEDUPLICATION & LOGGING LAYER
# =====================================================================

def deduplicate_records(raw_rows, error_log_path="database/migration_errors.log"):
    """
    Processes raw records line-by-line. Standardizes format, logs corrupt rows
    to an audit file, and deduplicates emails (retains latest signup_date).
    """
    processed_records = {}
    error_count = 0
    
    # Open error log file for auditing skipped records
    with open(error_log_path, mode='w', encoding='utf-8') as err_file:
        err_file.write(f"--- MIGRATION ERRORS LOG: {datetime.now()} ---\n")
        
        for line_num, row in enumerate(raw_rows, start=1):
            try:
                # Clean and validate the record structures
                clean_row = clean_and_validate_record(row)
                email = clean_row['email']
                
                if email not in processed_records:
                    # First time seeing this user
                    processed_records[email] = clean_row
                else:
                    # Duplicate email found! Compare timestamps to keep the newest profile
                    existing_date = datetime.strptime(processed_records[email]['signup_date'], "%Y-%m-%d %H:%M:%S")
                    incoming_date = datetime.strptime(clean_row['signup_date'], "%Y-%m-%d %H:%M:%S")
                    
                    if incoming_date > existing_date:
                        processed_records[email] = clean_row  # Overwrite with newer data
            
            except ValueError as err:
                error_count += 1
                # Log broken row details gracefully to error file
                err_file.write(f"Row {line_num} | Skipping due to error: {err} | Raw Content: {row}\n")
                
    print(f"Extraction logged {error_count} corrupt/missing rows to '{error_log_path}' for review.")
    return list(processed_records.values())

# =====================================================================
# 3. CORE ORCHESTRATION LAYER (ETL)
# =====================================================================

def run_migration(csv_file_path, db_url, run_verification_only=False):
    # Parse DB path from connection URL (sqlite:///path -> path)
    if db_url.startswith("sqlite:///"):
        db_path = db_url.replace("sqlite:///", "")
    else:
        db_path = db_url
        
    print(f"\n--- Starting Migration Pipeline (Target: {db_path}) ---")
    
    # --- PHASE 1: EXTRACTION ---
    raw_rows = []
    try:
        with open(csv_file_path, mode='r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            for row in reader:
                raw_rows.append(row)
    except FileNotFoundError:
        print(f"[ERROR]: Legacy source CSV file '{csv_file_path}' not found.")
        return False
        
    # --- PHASE 2: VERIFICATION RUN (100 Sample Records) ---
    if run_verification_only or len(raw_rows) > 0:
        sample_subset = raw_rows[:100]
        print(f"Executing localized verification test run on a sample subset of {len(sample_subset)} legacy records...")
        verified_data = deduplicate_records(sample_subset, error_log_path="database/verification_errors.log")
        print(f"Verification run complete: {len(verified_data)} sample rows successfully parsed & mapped.")
        
        if run_verification_only:
            print("--- Verification Run Complete (Full loading skipped) ---")
            return True

    # --- PHASE 3: FULL TRANSFORMATION & DEDUPLICATION ---
    print(f"Processing full database load of {len(raw_rows)} records...")
    final_clean_data = deduplicate_records(raw_rows, error_log_path="database/migration_errors.log")
    print(f"Data cleaning complete. Ready to load {len(final_clean_data)} unique records.")
    
    # --- PHASE 4: TRANSACTIONAL LOADING ---
    print("Connecting to target database and establishing transaction bounds...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Ensure production users table matches database models
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            name TEXT,
            phone TEXT,
            created_at DATETIME
        );
    """)
    
    success = False
    try:
        # Open transaction
        cursor.execute("BEGIN TRANSACTION;")
        
        insert_query = """
            INSERT OR REPLACE INTO users (email, password_hash, name, phone, created_at)
            VALUES (?, ?, ?, ?, ?);
        """
        
        # Batch insert clean users
        for user in final_clean_data:
            cursor.execute(insert_query, (
                user['email'],
                None, # password_hash starts empty for legacy imports
                user['name'],
                user['phone'],
                user['signup_date']
            ))
            
        conn.commit()
        print(f"Migration completed successfully! Loaded {len(final_clean_data)} users into database.")
        success = True
        
    except sqlite3.Error as db_error:
        conn.rollback()
        print(f"[FATAL MIGRATION ERROR]: Database load failed. Transaction rolled back. Error: {db_error}")
        
    finally:
        conn.close()
        print("--- Migration Pipeline Stopped ---")
        
    return success

if __name__ == "__main__":
    # Load database URL securely from env configuration
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./backend/ecommerce.db")
    
    # 1. Run Verification Migration first (100 sample subset)
    run_migration('database/mock_legacy_users.csv', DATABASE_URL, run_verification_only=True)
    
    # 2. Run Full Migration
    run_migration('database/mock_legacy_users.csv', DATABASE_URL, run_verification_only=False)