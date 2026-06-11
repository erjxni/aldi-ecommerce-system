-- SQL Helpers for ALDI E-Commerce SQLite Database (ecommerce.db)
-- You can run these using any SQLite tool/extension or Python shell.

-- =====================================================================
-- 1. VIEWING USER DATA
-- =====================================================================

-- Get all registered users
SELECT id, email, password_hash FROM users;

-- Search for a specific user by email
SELECT * FROM users WHERE email = 'test@example.com';

-- Count total number of registered users
SELECT COUNT(*) AS total_users FROM users;

-- View table schema information
PRAGMA table_info(users);


-- =====================================================================
-- 2. DELETING / CLEANING DATA
-- =====================================================================

-- Delete a specific user by email
DELETE FROM users WHERE email = 'test@example.com';

-- Clear the entire users table
DELETE FROM users;

-- Reset the autoincrement ID primary key sequence back to 1 (run after clearing the table)
DELETE FROM sqlite_sequence WHERE name = 'users';


-- =====================================================================
-- 3. INSERTING TEST DATA
-- =====================================================================

-- Insert a mock user (Note: password_hash should be bcrypt-hashed for real testing)
INSERT INTO users (email, password_hash) 
VALUES ('demo-user@aldi.com.au', '$2b$12$EixZaYVK1fsYi1WUXuGv6uO4zS099A0s9S1S1S1S1S1S1S1S1S1S1'); -- bcrypt hash of 'Password123'
