const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const path = require('path');

const keyPath = path.join(__dirname, '../aldi-ecommerce-managemen-b40e8-firebase-adminsdk-fbsvc-b76cea1fbf.json');
const serviceAccount = require(keyPath);

// Initialize Firebase App
const app = initializeApp({
  credential: cert(serviceAccount)
});

// Initialize Firebase SQL Connect (Data Connect)
const sqlConnect = getDataConnect({
  serviceId: 'aldi-ecommerce-managemen-b40e8-service',
  location: 'europe-west3'
});

module.exports = {
  app,
  sqlConnect
};
