const testConnection = require('./connection.test');
const testOperations = require('./operations.test');

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

  console.log('==================================================');
  if (operationsSuccess) {
    console.log('ALL TESTS PASSED SUCCESSFULLY');
    console.log('==================================================');
    process.exit(0);
  } else {
    console.error('SOME TESTS FAILED');
    console.log('==================================================');
    process.exit(1);
  }
}

runAll();
