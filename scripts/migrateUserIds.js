/**
 * server/scripts/migrateUserIds.js
 *
 * ONE-TIME migration: converts userId fields from BSON String → BSON ObjectId
 * in all document collections.
 *
 * WHY: The schema change to `userId: ObjectId` means MongoDB's BSON type must
 * also change. Old documents stored userId as a BSON String; queries using
 * ObjectId type will NOT match them without this migration.
 *
 * USAGE:
 *   cd server
 *   node scripts/migrateUserIds.js              # dry run (safe, no writes)
 *   node scripts/migrateUserIds.js --apply      # performs actual migration
 *
 * SAFETY:
 *   - Dry run by default — prints what it would do, changes nothing.
 *   - Idempotent: already-converted ObjectId values are skipped.
 *   - Run against Atlas: set MONGODB_URI in server/.env before running.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DRY_RUN = !process.argv.includes('--apply');

const COLLECTIONS = [
  'invoices',
  'deliverychallans',
  'quotations',
  'purchaseorders',
  'inventoryitems',
  'templates',
  'suppliers',
  'customers',
];

async function migrate() {
  if (!process.env.MONGODB_URI) {
    console.error('FATAL: MONGODB_URI not set in server/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');
  console.log(DRY_RUN ? '\n🔍 DRY RUN — no changes will be made.\n' : '\n⚡ APPLYING migration...\n');

  const db = mongoose.connection.db;
  let grandTotal = 0;

  for (const collectionName of COLLECTIONS) {
    const collection = db.collection(collectionName);

    // Find documents where userId is stored as a BSON String (typeof check via $type)
    // BSON type 2 = String, type 7 = ObjectId
    const docs = await collection.find({ userId: { $type: 'string' } }).toArray();

    if (docs.length === 0) {
      console.log(`✅ ${collectionName}: nothing to migrate`);
      continue;
    }

    console.log(`📋 ${collectionName}: ${docs.length} document(s) need migration`);
    grandTotal += docs.length;

    if (DRY_RUN) continue;

    let success = 0;
    let errors = 0;

    for (const doc of docs) {
      try {
        const oidUserId = new mongoose.Types.ObjectId(doc.userId);
        await collection.updateOne(
          { _id: doc._id },
          { $set: { userId: oidUserId } }
        );
        success++;
      } catch (err) {
        console.error(`  ❌ doc ${doc._id}: ${err.message}`);
        errors++;
      }
    }

    console.log(`  ✔ ${success} converted, ${errors} errors`);
  }

  if (DRY_RUN) {
    console.log(`\nDry run complete. ${grandTotal} document(s) would be migrated.`);
    console.log('Run with --apply to perform the migration:\n  node scripts/migrateUserIds.js --apply\n');
  } else {
    console.log(`\n✅ Migration complete. ${grandTotal} document(s) processed.`);
  }

  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
