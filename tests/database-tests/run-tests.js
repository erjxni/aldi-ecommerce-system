const testConnection = require('./connection.test');
const testOperations = require('./operations.test');
const testCheckoutFinancial = require('./checkout-financial.test');

async function runAll() {
  console.log('==================================================');
  console.log('Running ALDI Database Integration Tests');
  console.log('==================================================\n');

  const connectionSuccess = await testConnection();
  console.log('');
  
  if (!connectionSuccess) {
    console.error('Connection test failed. Skipping operation tests.');
    console.log('\n==================================================');
    console.error('TEST RUN FAILURE');
    console.log('==================================================');
    process.exit(1);
  }

  const operationsSuccess = await testOperations();
  console.log('');

  const checkoutSuccess = await testCheckoutFinancial();
  console.log('');

  console.log('==================================================');
  if (operationsSuccess && checkoutSuccess) {
    console.log('ALL TESTS PASSED SUCCESSFULLY');
    console.log('==================================================');
    process.exit(0);
  } else {
    console.error('SOME TESTS FAILED');
    if (!operationsSuccess) console.error('  - Operations tests: FAILED');
    if (!checkoutSuccess) console.error('  - Checkout-Financial tests: FAILED');
    console.log('==================================================');
    process.exit(1);
  }
}

runAll();

