const { initializeApp, cert } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');
const { PDFParse } = require('pdf-parse');
const path = require('path');

async function testReal() {
  let serviceAccount;
  if (process.env.ALDI_SQL_CONNECT_API_KEY) {
    serviceAccount = JSON.parse(process.env.ALDI_SQL_CONNECT_API_KEY);
  } else {
    const keyPath = path.join(__dirname, '../aldi-ecommerce-managemen-b40e8-firebase-adminsdk-fbsvc-b76cea1fbf.json');
    serviceAccount = require(keyPath);
  }

  const app = initializeApp({
    credential: cert(serviceAccount),
    storageBucket: 'aldi-ecommerce-managemen-b40e8.firebasestorage.app'
  }, 'test-real-app');

  const storage = getStorage(app);
  const bucket = storage.bucket();

  // Try downloading the libunit PDF file
  const filePath = 'documents/1782711748865_Subject_libunit.pdf';
  console.log(`Downloading ${filePath}...`);
  const storageFile = bucket.file(filePath);
  const [buffer] = await storageFile.download();
  console.log('Downloaded buffer length:', buffer.length);

  const parser = new PDFParse({ data: buffer });
  await parser.load();
  const text = await parser.getText();
  console.log('--- TYPE OF TEXT ---', typeof text);
  console.log('--- TEXT VALUE ---', text);
  if (text && typeof text === 'object') {
    console.log('Keys of text:', Object.keys(text));
  }
  parser.destroy();
}

testReal().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
