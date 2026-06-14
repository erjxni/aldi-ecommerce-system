# Database Directory

This directory contains scripts and files used for database migrations, mock data generation, and ETL (Extract, Transform, Load) processes.

## Files
- `generate_legacy_data.py`: A Python script used to generate mock legacy user data for testing migrations.
- `init_user_schema.sql`: SQL script for initializing the raw user schema.
- `migration.py`: The main ETL script used to migrate the mock legacy data into the modern database schema.
- `migration_errors.log`: A log file that records any errors or failed rows encountered during the data migration process.
- `mock_legacy_users.csv`: The generated CSV dataset containing mock legacy users used as the source for the migration.
- `products.json`: A JSON file containing the default product catalog, used for initial database seeding.
- `verification_errors.log`: A log file that records any discrepancies found during post-migration data verification.
