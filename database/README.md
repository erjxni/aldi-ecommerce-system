# Database Directory

This directory contains files used for local database management and mock data generation for the ALDI E-Commerce System.

## Files

- `products.json`: A JSON file containing the default product catalog, used for initial product database seeding and fetching.
- `seed.js`: A Node.js script used to generate mock users and seed the `ecommerce.db` SQLite database with random passwords and realistic user data.

## Usage

To generate mock users for local testing:

```bash
node database/seed.js
```

This will clear the current users table and generate 50 mock users. The script will output 3 sample users (email and password) to the terminal that you can use to test the login flow.

Here are some sample users you can log in with:
Name: Patricia Martinez
Email: user_1@aldi-mock.com
Password: e2deb4ce
-------------------------
Name: Jessica Thomas
Email: user_2@aldi-mock.com
Password: 383b2456
-------------------------
Name: Mary Jones
Email: user_3@aldi-mock.com
Password: a6aa18bb
-------------------------