const testConnection = require('./connection.test');
const testOperations = require('./operations.test');
const testCheckoutFinancial = require('./checkout-financial.test');
const testDocumentUpload = require('./document-upload.test');
const testWhatsAppAnalytics = require('./whatsapp-analytics.test');
const testMeetings = require('./meetings.test');

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

  const uploadSuccess = await testDocumentUpload();
  console.log('');

  const whatsappSuccess = await testWhatsAppAnalytics();
  console.log('');

  console.log('==================================================');
  if (operationsSuccess && checkoutSuccess && uploadSuccess && meetingsSuccess && whatsappSuccess) {
    console.log('ALL TESTS PASSED SUCCESSFULLY');
    console.log('==================================================');
    process.exit(0);
  } else {
    console.error('SOME TESTS FAILED');
    if (!operationsSuccess) console.error('  - Operations tests: FAILED');
    if (!checkoutSuccess) console.error('  - Checkout-Financial tests: FAILED');
    if (!uploadSuccess) console.error('  - Document Upload tests: FAILED');
    if (!whatsappSuccess) console.error('  - WhatsApp Analytics tests: FAILED');
    if (!meetingsSuccess) console.error('  - Meetings tests: FAILED');
    console.log('==================================================');
    process.exit(1);
  }
}

runAll();

