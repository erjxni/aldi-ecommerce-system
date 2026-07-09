const crypto = require('crypto');

async function seed() {
  console.log('[Seed] Starting WhatsApp mock data population...');

  // Start Express server
  const { server } = require('../backend/server.js');
  
  if (!server.listening) {
    await new Promise((resolve) => {
      server.listen(3001, () => {
        console.log('[Seed] Temporary server listening on port 3001');
        resolve();
      });
    });
  }

  // Generate realistic data points at various hours of the day (in UTC)
  const mockLogs = [
    // Peak hours: 9 AM to 11 AM (Hours 9, 10, 11)
    { topicCluster: 'Product Inquiry', sentimentScore: 0.8, timestamp: '2026-07-05T09:15:00.000Z', phoneNumber: '+31600000001', senderName: 'Alice' },
    { topicCluster: 'Product Inquiry', sentimentScore: 0.9, timestamp: '2026-07-05T09:45:00.000Z', phoneNumber: '+31600000002', senderName: 'Bob' },
    { topicCluster: 'Order Issue', sentimentScore: -0.6, timestamp: '2026-07-05T10:05:00.000Z', phoneNumber: '+31600000003', senderName: 'Charlie' },
    { topicCluster: 'Delivery Status', sentimentScore: 0.2, timestamp: '2026-07-05T10:30:00.000Z', phoneNumber: '+31600000004', senderName: 'David' },
    { topicCluster: 'Product Inquiry', sentimentScore: 0.7, timestamp: '2026-07-05T11:20:00.000Z', phoneNumber: '+31600000005', senderName: 'Eve' },
    { topicCluster: 'Refund Request', sentimentScore: -0.9, timestamp: '2026-07-05T11:55:00.000Z', phoneNumber: '+31600000006', senderName: 'Frank' },

    // Afternoon hours: 2 PM to 4 PM (Hours 14, 15, 16)
    { topicCluster: 'Delivery Status', sentimentScore: 0.5, timestamp: '2026-07-05T14:10:00.000Z', phoneNumber: '+31600000007', senderName: 'Grace' },
    { topicCluster: 'Delivery Status', sentimentScore: 0.4, timestamp: '2026-07-05T14:40:00.000Z', phoneNumber: '+31600000008', senderName: 'Heidi' },
    { topicCluster: 'Order Issue', sentimentScore: -0.4, timestamp: '2026-07-05T15:15:00.000Z', phoneNumber: '+31600000009', senderName: 'Ivan' },
    { topicCluster: 'Product Inquiry', sentimentScore: 0.8, timestamp: '2026-07-05T15:50:00.000Z', phoneNumber: '+31600000010', senderName: 'Judy' },
    { topicCluster: 'Refund Request', sentimentScore: -0.5, timestamp: '2026-07-05T16:12:00.000Z', phoneNumber: '+31600000011', senderName: 'Karl' },
    { topicCluster: 'Payment Issue', sentimentScore: -0.7, timestamp: '2026-07-05T16:45:00.000Z', phoneNumber: '+31600000012', senderName: 'Leo' },

    // Evening/Night low-traffic hours (Hours 20, 22, 02)
    { topicCluster: 'Product Inquiry', sentimentScore: 0.6, timestamp: '2026-07-05T20:30:00.000Z', phoneNumber: '+31600000013', senderName: 'Mallory' },
    { topicCluster: 'Order Issue', sentimentScore: -0.2, timestamp: '2026-07-05T22:15:00.000Z', phoneNumber: '+31600000014', senderName: 'Niel' },
    { topicCluster: 'Product Inquiry', sentimentScore: 0.9, timestamp: '2026-07-06T02:40:00.000Z', phoneNumber: '+31600000015', senderName: 'Oscar' }
  ];

  console.log(`[Seed] Ingesting ${mockLogs.length} mock logs through the webhook endpoint...`);

  let countSuccess = 0;
  for (const log of mockLogs) {
    try {
      const res = await fetch('http://localhost:3001/api/analytics/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });
      if (res.status === 201) {
        countSuccess++;
      } else {
        console.warn(`[Seed] Failed to ingest log at ${log.timestamp}. Status: ${res.status}`);
      }
    } catch (err) {
      console.error(`[Seed] Network error ingesting log:`, err.message);
    }
  }

  console.log(`[Seed] Ingestion finished. Successfully processed: ${countSuccess}/${mockLogs.length} logs.`);

  // Close server
  await new Promise((resolve) => {
    server.close(() => {
      console.log('[Seed] Temporary server closed.');
      resolve();
    });
  });

  console.log('[Seed] Seeding completed.');
}

seed().then(() => process.exit(0));
