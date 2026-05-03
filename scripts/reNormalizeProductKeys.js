/**
 * server/scripts/reNormalizeProductKeys.js
 * 
 * Re-normalizes product keys in existing invoices and inventory items
 * to fix the issue where decimals were previously stripped (e.g. 2.5sqmm -> 25sqmm).
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const { normalizeProductKey } = require('../utils/productUtils');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  const db = mongoose.connection.db;
  const invoicesCol = db.collection('invoices');
  const inventoryCol = db.collection('inventoryitems');

  let invoicesUpdated = 0;
  let itemsUpdated = 0;

  console.log('--- Checking Invoices ---');
  const invoices = await invoicesCol.find({}).toArray();
  for (const inv of invoices) {
    let changed = false;
    if (inv.items && Array.isArray(inv.items)) {
      for (const item of inv.items) {
        const newKey = normalizeProductKey(item.description);
        if (item.productKey !== newKey) {
          item.productKey = newKey;
          changed = true;
          itemsUpdated++;
        }
      }
    }
    if (changed) {
      await invoicesCol.updateOne({ _id: inv._id }, { $set: { items: inv.items } });
      invoicesUpdated++;
    }
  }
  console.log(`Updated ${invoicesUpdated} invoices (total ${itemsUpdated} items fixed).`);

  console.log('\n--- Checking Inventory Items ---');
  let inventoryUpdated = 0;
  const inventoryItems = await inventoryCol.find({}).toArray();
  for (const item of inventoryItems) {
    const newKey = normalizeProductKey(item.description);
    if (item.productKey !== newKey) {
      try {
        await inventoryCol.updateOne({ _id: item._id }, { $set: { productKey: newKey } });
        inventoryUpdated++;
      } catch (err) {
        if (err.code === 11000) {
          console.warn(`Duplicate key violation for ${newKey} (ID: ${item._id}). Merging quantities...`);
          // Find the existing one and merge
          const existing = await inventoryCol.findOne({
            userId: item.userId,
            financialYear: item.financialYear,
            transactionType: item.transactionType,
            productKey: newKey
          });
          if (existing) {
            await inventoryCol.updateOne(
              { _id: existing._id },
              { $inc: { quantity: item.quantity, currentStock: item.currentStock } }
            );
            await inventoryCol.deleteOne({ _id: item._id });
            inventoryUpdated++;
          }
        } else {
          console.error('Error updating inventory item:', err);
        }
      }
    }
  }
  console.log(`Updated/Merged ${inventoryUpdated} inventory items.`);

  console.log('\nDone.');
  process.exit(0);
}

run().catch(console.error);
