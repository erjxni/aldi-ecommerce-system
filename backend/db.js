const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const { getStorage } = require('firebase-admin/storage');
const path = require('path');

let serviceAccount;
if (process.env.ALDI_SQL_CONNECT_API_KEY) {
  try {
    serviceAccount = JSON.parse(process.env.ALDI_SQL_CONNECT_API_KEY);
  } catch (error) {
    console.error('Failed to parse ALDI_SQL_CONNECT_API_KEY from environment variables:', error);
    process.exit(1);
  }
} else {
  try {
    const keyPath = path.join(__dirname, '../aldi-ecommerce-managemen-b40e8-firebase-adminsdk-fbsvc-b76cea1fbf.json');
    serviceAccount = require(keyPath);
  } catch (error) {
    console.error('Error: Firebase credentials not found. Please set the ALDI_SQL_CONNECT_API_KEY environment variable or verify the credential JSON file exists at the root.');
    process.exit(1);
  }
}

// Initialize Firebase App
const app = initializeApp({
  credential: cert(serviceAccount),
  storageBucket: 'aldi-ecommerce-managemen-b40e8.appspot.com'
});

// Initialize Firebase SQL Connect (Data Connect)
const sqlConnect = getDataConnect({
  serviceId: 'aldi-ecommerce-managemen-b40e8-service',
  location: 'europe-west3'
});

const storage = getStorage(app);

module.exports = {
  app,
  sqlConnect,
  storage
};
