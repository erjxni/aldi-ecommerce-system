/**
 * Create Meeting table in Firebase Cloud SQL
 *
 * Run this script once to deploy the meetings schema:
 *   node database/create-meetings-table.js
 *
 * Tables:
 *   - meeting: id, title, description, date, minutes_document_id (FK), created_at
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const path = require('path');

async function createMeetingsTable() {
  console.log('[Migration] Starting meetings table creation...');

  let serviceAccount;
  if (process.env.ALDI_SQL_CONNECT_API_KEY) {
    try {
      serviceAccount = JSON.parse(process.env.ALDI_SQL_CONNECT_API_KEY);
    } catch (error) {
      console.error('[Migration] Failed to parse ALDI_SQL_CONNECT_API_KEY:', error);
      process.exit(1);
    }
  } else {
    try {
      const keyPath = path.join(__dirname, '../aldi-ecommerce-managemen-b40e8-firebase-adminsdk-fbsvc-b76cea1fbf.json');
      serviceAccount = require(keyPath);
    } catch (error) {
      console.error('[Migration] Firebase credentials not found.');
      process.exit(1);
    }
  }

  const app = initializeApp(
    { credential: cert(serviceAccount) },
    'meetings-migration-app'
  );

  const sqlConnect = getDataConnect(
    { serviceId: 'aldi-ecommerce-managemen-b40e8-service', location: 'europe-west3' },
    app
  );

  /**
   * Helper: run a raw SQL mutation via Firebase Data Connect _execute.
   */
  async function runSQL(label, sql) {
    const mutation = `mutation Migration { _execute(sql: ${JSON.stringify(sql)}) }`;
    try {
      await sqlConnect.executeGraphql(mutation);
      console.log(`[Migration] ✓ ${label}`);
      return true;
    } catch (err) {
      const msg = String(err.message || '').toLowerCase();
      if (msg.includes('already exists')) {
        console.log(`[Migration] ✓ ${label} (already exists — skipped)`);
        return true;
      }
      console.error(`[Migration] ✗ ${label}:`, err.message || err);
      throw err;
    }
  }

  // ----------------------------------------------------------------
  // Step 1: Create "meeting" table
  // ----------------------------------------------------------------
  await runSQL(
    '"meeting" table',
    'CREATE TABLE IF NOT EXISTS "meeting" (id UUID PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT \'\', "date" TIMESTAMP NOT NULL, minutes_document_id UUID REFERENCES "document"(id) ON DELETE SET NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  );

  // ----------------------------------------------------------------
  // Step 2: Create index for fast date sorted lookups
  // ----------------------------------------------------------------
  try {
    await runSQL(
      'Index on meeting.date',
      'CREATE INDEX IF NOT EXISTS idx_meeting_date ON "meeting" ("date")'
    );
  } catch (_) {
    console.warn('[Migration] ⚠ Index creation failed (non-fatal).');
  }

  console.log('\n[Migration] ✅ Meeting table successfully deployed to Firebase Cloud SQL.');
}

// Run if invoked directly
if (require.main === module) {
  createMeetingsTable()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createMeetingsTable;
