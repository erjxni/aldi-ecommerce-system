# Tests Directory

This directory contains automated integration tests for the ALDI E-Commerce System database operations and API checkout transactions.

## Structure

* **`database-tests/`**
  * **[`connection.test.js`](file:///e:/projects/antigravity/aldi-ecommerce-system/tests/database-tests/connection.test.js)**: Verifies successful connection to Firebase Data Connect by executing a basic introspective query.
  * **[`operations.test.js`](file:///e:/projects/antigravity/aldi-ecommerce-system/tests/database-tests/operations.test.js)**: Runs CRUD operations (Create, Read, Update, Delete) against the `User` table to verify read/write database permissions.
  * **[`checkout-financial.test.js`](file:///e:/projects/antigravity/aldi-ecommerce-system/tests/database-tests/checkout-financial.test.js)**: Validates transactional integrity and atomicity of the `/api/checkout` endpoint:
    - **Test 1**: Verifies a successful checkout properly inserts an `Order`, `OrderItems`, and `FinancialRecord`.
    - **Test 2**: Checks that the `FinancialRecord` amount exactly matches the `Order` total.
    - **Test 3**: Confirms the manual database rollback logic deletes the `Order` and its `OrderItems` if the `FinancialRecord` insertion fails.
    - **Test 4**: Verifies the payload structure for real-time WebSocket notifications sent to the admin dashboard.
  * **[`run-tests.js`](file:///e:/projects/antigravity/aldi-ecommerce-system/tests/database-tests/run-tests.js)**: Entry point orchestrator that runs the test suites sequentially and exits with the appropriate status code.

## Running Tests

To run the test suites locally, execute:
```bash
npm test
```

### Environment Setup
The integration tests interact with Firebase Data Connect. By default, the tests look for the Firebase Admin credential file `aldi-ecommerce-managemen-b40e8-firebase-adminsdk-fbsvc-b76cea1fbf.json` at the root of the project.

In CI/CD (GitHub Actions), you can configure credentials using the `ALDI_SQL_CONNECT_API_KEY` environment variable containing the service account JSON string.
