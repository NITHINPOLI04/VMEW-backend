/**
 * server/scripts/migrateInventory.js
 *
 * One-time migration script to backfill productKey and currentStock
 * on existing inventory records.
 * [DEPRECATED]: This script computes `currentStock = totalPurchased - totalSold` 
 * which does not match the current incremental tracking behavior on Purchase records. 
 * Use `syncInvoicesToInventory.js` instead.
 *
 * Usage:  node server/scripts/migrateInventory.js
 *
 * SAFE: Idempotent — can be run multiple times without data loss.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI not set in .env');
  process.exit(1);
}

// Inline the utility so this script is self-contained
function normalizeProductKey(description) {
  return (description || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._]/g, '');
}

function computeStockStatus(currentStock) {
  if (currentStock <= 0) return 'Out of Stock';
  if (currentStock < 10) return 'Low Stock';
  return 'In Stock';
}

async function migrate() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected.\n');

  const db = mongoose.connection.db;
  const collection = db.collection('inventoryitems');

  // Step 1: Backfill productKey on all records missing it
  console.log('── Step 1: Backfill productKey ──');
  const allItems = await collection.find({ $or: [{ productKey: { $exists: false } }, { productKey: '' }] }).toArray();
  let backfilled = 0;

  for (const item of allItems) {
    const pk = normalizeProductKey(item.description);
    await collection.updateOne({ _id: item._id }, { $set: { productKey: pk } });
    backfilled++;
  }
  console.log(`   Backfilled productKey on ${backfilled} records.\n`);

  // Step 2: Compute currentStock per (userId, productKey)
  console.log('── Step 2: Compute currentStock ──');

  const groups = await collection.aggregate([
    { $match: { productKey: { $ne: '' } } },
    {
      $group: {
        _id: { userId: '$userId', productKey: '$productKey' },
        totalPurchased: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'Purchase'] }, '$quantity', 0] },
        },
        totalSold: {
          $sum: { $cond: [{ $eq: ['$transactionType', 'Sales'] }, '$quantity', 0] },
        },
      },
    },
  ]).toArray();

  let stockUpdated = 0;

  for (const group of groups) {
    const { userId, productKey } = group._id;
    const currentStock = group.totalPurchased - group.totalSold;
    const status = computeStockStatus(currentStock);

    // Update ALL Purchase records for this product with the computed stock
    const result = await collection.updateMany(
      { userId, productKey, transactionType: 'Purchase' },
      { $set: { currentStock, status } }
    );
    stockUpdated += result.modifiedCount;
  }

  console.log(`   Updated currentStock on ${stockUpdated} Purchase records across ${groups.length} product groups.\n`);

  // Step 3: Ensure currentStock defaults on Sales records
  const salesResult = await collection.updateMany(
    { transactionType: 'Sales', currentStock: { $exists: false } },
    { $set: { currentStock: 0 } }
  );
  console.log(`   Defaulted currentStock on ${salesResult.modifiedCount} Sales records.\n`);

  console.log('✅ Migration complete!');
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
