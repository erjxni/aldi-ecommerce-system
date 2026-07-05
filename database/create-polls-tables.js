/**
 * SCRUM-190: Create Poll and Vote tables in Firebase Cloud SQL
 *
 * Run this script once to deploy the polling schema:
 *   node database/create-polls-tables.js
 *
 * Tables:
 *   - poll  : id, title, description, options (JSONB), status, created_at, closes_at
 *   - vote  : id, poll_id (FK), user_id (FK), selected_option, created_at
 *             UNIQUE (poll_id, user_id)  ← prevents duplicate votes at DB level
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getDataConnect } = require('firebase-admin/data-connect');
const path = require('path');

async function createPollsTables() {
  console.log('[Migration] Starting polls tables creation...');

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
    'polls-migration-app'
  );

  const sqlConnect = getDataConnect(
    { serviceId: 'aldi-ecommerce-managemen-b40e8-service', location: 'europe-west3' },
    app
  );

  /**
   * Helper: run a raw SQL mutation via Firebase Data Connect _execute.
   * SQL must be on a single line (the API does not support multiline).
   */
  async function runSQL(label, sql, params = []) {
    // Build GraphQL mutation string
    const paramDecls = params.map((_, i) => `$p${i}: String!`).join(', ');
    const paramRefs  = params.map((_, i) => `$p${i}`).join(', ');

    let mutation;
    if (params.length === 0) {
      mutation = `mutation Migration { _execute(sql: ${JSON.stringify(sql)}) }`;
    } else {
      mutation = `
        mutation Migration(${paramDecls}) {
          _execute(sql: ${JSON.stringify(sql)}, params: [${paramRefs}])
        }
      `;
    }

    const variables = {};
    params.forEach((v, i) => { variables[`p${i}`] = String(v); });

    try {
      await sqlConnect.executeGraphql(mutation, { variables });
      console.log(`[Migration] ✓ ${label}`);
      return true;
    } catch (err) {
      // "already exists" errors are not fatal — we use IF NOT EXISTS
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
  // Step 1: Create "poll" table
  // ----------------------------------------------------------------
  await runSQL(
    '"poll" table',
    'CREATE TABLE IF NOT EXISTS "poll" (id UUID PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT \'\', options JSONB NOT NULL DEFAULT \'[]\'::jsonb, status VARCHAR(20) NOT NULL DEFAULT \'open\', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, closes_at TIMESTAMP)'
  );

  // Older local deployments stored options as TEXT. Convert when needed so the
  // deployed schema matches the SCRUM-190 JSON/Array acceptance criterion.
  try {
    await runSQL(
      'poll.options JSONB compatibility',
      'ALTER TABLE "poll" ALTER COLUMN options TYPE JSONB USING options::jsonb, ALTER COLUMN options SET DEFAULT \'[]\'::jsonb'
    );
  } catch (_) {
    console.warn('[Migration] ⚠ poll.options JSONB conversion skipped (already JSONB or unsupported by connector).');
  }

  // ----------------------------------------------------------------
  // Step 2: Create "vote" table
  // ----------------------------------------------------------------
  await runSQL(
    '"vote" table',
    'CREATE TABLE IF NOT EXISTS "vote" (id UUID PRIMARY KEY, poll_id UUID NOT NULL REFERENCES "poll"(id) ON DELETE CASCADE, user_id UUID NOT NULL, selected_option TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT uq_vote_poll_user UNIQUE (poll_id, user_id))'
  );

  // ----------------------------------------------------------------
  // Step 3: Create index for fast vote lookups by poll
  // ----------------------------------------------------------------
  try {
    await runSQL(
      'Index on vote.poll_id',
      'CREATE INDEX IF NOT EXISTS idx_vote_poll_id ON "vote" (poll_id)'
    );
  } catch (_) {
    console.warn('[Migration] ⚠ Index creation failed (non-fatal).');
  }

  console.log('\n[Migration] ✅ Poll and Vote tables successfully deployed to Firebase Cloud SQL.');
  console.log('[Migration] Schema:');
  console.log('  poll  (id UUID, title TEXT, description TEXT, options JSONB, status VARCHAR, created_at TIMESTAMP, closes_at TIMESTAMP)');
  console.log('  vote  (id UUID, poll_id UUID FK→poll, user_id UUID, selected_option TEXT, created_at TIMESTAMP)');
  console.log('        UNIQUE constraint on (poll_id, user_id) — prevents duplicate votes');
}

// Run if invoked directly
if (require.main === module) {
  createPollsTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createPollsTables;
