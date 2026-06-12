import csv
import sqlite3
from datetime import datetime

# =====================================================================
# 1. TRANSFORMATION & CLEANING LAYER (Pure Logic)
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
    # Critical Check: If email is missing, the record is unresolvable
    email = row.get('email', '').strip().lower()
    if not email:
        raise ValueError("Critical field missing: 'email' cannot be empty.")
        
    # Standardize the date using our helper
    clean_date = standardize_date(row.get('signup_date', ''))
    
    # Optional Check: Apply fallback default values if non-critical data is missing
    phone = row.get('phone', '').strip()
    if not phone:
        phone = "Unknown"
        
    return {
        "name": row.get('name', '').strip(),
        "email": email,
        "signup_date": clean_date,
        "phone": phone
    }

# =====================================================================
# 2. IN-MEMORY DEDUPLICATION LAYER
# =====================================================================

def deduplicate_records(raw_rows):
    """
    Processes raw records line-by-line. If a duplicate email is found,
    it retains only the record with the most recent signup date.
    """
    processed_records = {}
    error_log = []
    
    for line_num, row in enumerate(raw_rows, start=1):
        try:
            # Clean and validate the string structures first
            clean_row = clean_and_validate_record(row)
            email = clean_row['email']
            
            if email not in processed_records:
                # First time seeing this user
                processed_records[email] = clean_row
            else:
                # Duplicate found! Compare timestamps to keep the newest profile
                existing_date = datetime.strptime(processed_records[email]['signup_date'], "%Y-%m-%d %H:%M:%S")
                incoming_date = datetime.strptime(clean_row['signup_date'], "%Y-%m-%d %H:%M:%S")
                
                if incoming_date > existing_date:
                    processed_records[email] = clean_row  # Overwrite with newer data
        
        except ValueError as err:
            # Log structural issues or unparseable rows without crashing the entire script
            error_log.append(f"Row {line_num} skipped error: {err}")
            
    # Print extraction errors to console for engineering visibility
    for log in error_log:
        print(f"[LOG - FAILED ROW]: {log}")
        
    return list(processed_records.values())

# =====================================================================
# 3. CORE ORCHESTRATION LAYER (Extract, Transform, Load)
# =====================================================================

def run_migration(csv_file_path, db_path):
    print("--- Starting Migration Pipeline ---")
    
    # --- PHASE 1: EXTRACTION ---
    print("Extracting raw records from source file...")
    raw_rows = []
    with open(csv_file_path, mode='r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        for row in reader:
            raw_rows.append(row)
            
    # --- PHASE 2: TRANSFORMATION & DEDUPLICATION ---
    print(f"Processing and cleaning {len(raw_rows)} records...")
    final_clean_data = deduplicate_records(raw_rows)
    print(f"Data cleaning complete. Ready to load {len(final_clean_data)} unique records.")
    
    # --- PHASE 3: TRANSACTIONAL LOADING ---
    print("Connecting to target production database...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Create the production target table with strict constraints
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            created_at DATETIME NOT NULL,
            phone TEXT NOT NULL
        );
    """)
    
    try:
        # Explicitly open a secure database transaction guard
        cursor.execute("BEGIN TRANSACTION;")
        
        insert_query = """
            INSERT INTO users (name, email, created_at, phone)
            VALUES (?, ?, ?, ?);
        """
        
        # Batch insert the perfectly formatted rows
        for user in final_clean_data:
            cursor.execute(insert_query, (
                user['name'],
                user['email'],
                user['signup_date'],
                user['phone']
            ))
            
        # If no exceptions were raised, commit everything permanently to disk
        conn.commit()
        print("Database transaction successfully committed!")
        
    except sqlite3.Error as db_error:
        # CRITICAL GUARDRAIL: If a unique or null constraint is broken, roll back everything
        conn.rollback()
        print(f"[FATAL MIGRATION ERROR]: Transaction rolled back entirely. Error: {db_error}")
        
    finally:
        conn.close()
        print("--- Migration Pipeline Stopped ---")

# =====================================================================
# 4. SCRIPT EXECUTION ENTRYPOINT
# =====================================================================
if __name__ == "__main__":
    # Point the pipeline to your data files and trigger execution
    run_migration('mock_legacy_users.csv', 'aldi_ecommerce.db')