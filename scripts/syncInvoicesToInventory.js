/**
 * server/scripts/syncInvoicesToInventory.js
 *
 * One-time migration script to synchronize existing invoice data
 * into the inventory system.
 *
 * What it does:
 *   1. Scans ALL invoices in the database
 *   2. Aggregates item quantities per (userId, productKey, financialYear)
 *   3. Creates/updates Sales inventory records with the correct total sold qty
 *   4. Ensures Purchase inventory records exist (initialized to currentStock: 0)
 *   5. Backfills productKey on invoice items that are missing it
 *
 * Safety guarantees:
 *   - IDEMPOTENT: Safe to run multiple times. Uses upsert logic so
 *     duplicate records are never created.
 *   - NON-DESTRUCTIVE: Never deletes existing inventory records.
 *     Purchase records that already have real stock data are left untouched.
 *   - DRY-RUN MODE: Run with --dry-run flag to preview changes without writing.
 *
 * Usage:
 *   node server/scripts/syncInvoicesToInventory.js            # execute
 *   node server/scripts/syncInvoicesToInventory.js --dry-run   # preview only
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

const DRY_RUN = process.argv.includes('--dry-run');

// ── Inline utilities (self-contained script) ────────────────────────────────

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

function getFinancialYear(dateInput) {
  const d = new Date(dateInput);
  const month = d.getMonth();
  const year = d.getFullYear();
  return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

// ── Main migration ──────────────────────────────────────────────────────────

async function run() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Invoice → Inventory Sync Migration`);
  console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '🔧 LIVE EXECUTION'}`);
  console.log(`${'═'.repeat(60)}\n`);

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB.\n');

  const db = mongoose.connection.db;
  const invoicesCol = db.collection('invoices');
  const inventoryCol = db.collection('inventoryitems');

  // ── Step 1: Load all invoices ───────────────────────────────────────────
  console.log('── Step 1: Loading all invoices ──');
  const allInvoices = await invoicesCol.find({}).toArray();
  console.log(`   Found ${allInvoices.length} invoices.\n`);

  if (allInvoices.length === 0) {
    console.log('   Nothing to sync. Exiting.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // ── Step 2: Aggregate items into a map ──────────────────────────────────
  // Key: "userId|productKey|financialYear"
  // Value: { totalQty, description, hsnSacCode, unit, rate, userId, productKey, financialYear }
  console.log('── Step 2: Aggregating invoice items ──');

  const salesMap = new Map();
  let totalItemsProcessed = 0;
  let invoicesMissingProductKey = 0;

  for (const invoice of allInvoices) {
    const userId = invoice.userId.toString();
    const fy = invoice.financialYear || getFinancialYear(invoice.date);
    let invoiceNeedsPkBackfill = false;

    for (const item of (invoice.items || [])) {
      const pk = normalizeProductKey(item.description);
      if (!pk) continue;

      // Track if this invoice item needs productKey backfill
      if (!item.productKey) {
        invoiceNeedsPkBackfill = true;
      }

      const mapKey = `${userId}|${pk}|${fy}`;

      if (salesMap.has(mapKey)) {
        const existing = salesMap.get(mapKey);
        existing.totalQty += item.quantity;
        // Keep the latest rate/hsn/unit (from most recent invoice)
        if (new Date(invoice.date) > new Date(existing._latestDate)) {
          existing.rate = item.rate;
          existing.hsnSacCode = item.hsnSacCode;
          existing.unit = item.unit;
          existing.description = item.description;
          existing._latestDate = invoice.date;
        }
      } else {
        salesMap.set(mapKey, {
          userId: invoice.userId,
          productKey: pk,
          financialYear: fy,
          description: item.description,
          hsnSacCode: item.hsnSacCode || '',
          unit: item.unit || 'Nos',
          rate: item.rate || 0,
          totalQty: item.quantity,
          _latestDate: invoice.date,
        });
      }

      totalItemsProcessed++;
    }

    // Backfill productKey on invoice items that are missing it
    if (invoiceNeedsPkBackfill && !DRY_RUN) {
      const updatedItems = (invoice.items || []).map(item => ({
        ...item,
        productKey: item.productKey || normalizeProductKey(item.description),
      }));
      await invoicesCol.updateOne(
        { _id: invoice._id },
        { $set: { items: updatedItems } }
      );
      invoicesMissingProductKey++;
    }
  }

  console.log(`   Processed ${totalItemsProcessed} line items across ${allInvoices.length} invoices.`);
  console.log(`   Found ${salesMap.size} unique product-FY combinations.`);
  if (invoicesMissingProductKey > 0) {
    console.log(`   Backfilled productKey on ${invoicesMissingProductKey} invoices.`);
  }
  console.log();

  // ── Step 3: Upsert Sales records ────────────────────────────────────────
  console.log('── Step 3: Syncing Sales inventory records ──');

  let salesCreated = 0;
  let salesUpdated = 0;
  let salesSkipped = 0;

  for (const [, data] of salesMap) {
    const filter = {
      userId: data.userId,
      productKey: data.productKey,
      financialYear: data.financialYear,
      transactionType: 'Sales',
    };

    const existingSales = await inventoryCol.findOne(filter);

    if (existingSales) {
      // Only update if quantities differ
      if (existingSales.quantity !== data.totalQty) {
        if (!DRY_RUN) {
          await inventoryCol.updateOne(
            { _id: existingSales._id },
            {
              $set: {
                quantity: data.totalQty,
                description: data.description,
                hsnSacCode: data.hsnSacCode,
                unit: data.unit,
                rate: data.rate,
              }
            }
          );
        }
        salesUpdated++;
        console.log(`   📝 Updated: ${data.description} (${data.financialYear}) qty ${existingSales.quantity} → ${data.totalQty}`);
      } else {
        salesSkipped++;
      }
    } else {
      if (!DRY_RUN) {
        await inventoryCol.insertOne({
          userId: data.userId,
          description: data.description,
          hsnSacCode: data.hsnSacCode,
          quantity: data.totalQty,
          unit: data.unit,
          rate: data.rate,
          transactionType: 'Sales',
          status: 'In Stock',
          financialYear: data.financialYear,
          productKey: data.productKey,
          currentStock: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      salesCreated++;
      console.log(`   ✨ Created: ${data.description} (${data.financialYear}) qty ${data.totalQty}`);
    }
  }

  console.log(`\n   Summary: ${salesCreated} created, ${salesUpdated} updated, ${salesSkipped} already correct.\n`);

  // ── Step 4: Ensure Purchase records exist ───────────────────────────────
  console.log('── Step 4: Ensuring Purchase records exist ──');

  let purchaseCreated = 0;
  let purchaseSkipped = 0;

  for (const [, data] of salesMap) {
    const purchaseFilter = {
      userId: data.userId,
      productKey: data.productKey,
      financialYear: data.financialYear,
      transactionType: 'Purchase',
    };

    const existingPurchase = await inventoryCol.findOne(purchaseFilter);

    if (existingPurchase) {
      purchaseSkipped++;
    } else {
      if (!DRY_RUN) {
        await inventoryCol.insertOne({
          userId: data.userId,
          description: data.description,
          hsnSacCode: data.hsnSacCode,
          quantity: 0,
          unit: data.unit,
          rate: data.rate,
          transactionType: 'Purchase',
          status: 'Out of Stock',
          financialYear: data.financialYear,
          productKey: data.productKey,
          currentStock: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      purchaseCreated++;
      console.log(`   📦 Created Purchase stub: ${data.description} (${data.financialYear}) stock=0`);
    }
  }

  console.log(`\n   Summary: ${purchaseCreated} created, ${purchaseSkipped} already existed.\n`);

  // ── Step 5: Final report ────────────────────────────────────────────────
  console.log(`${'═'.repeat(60)}`);
  console.log(`  MIGRATION COMPLETE ${DRY_RUN ? '(DRY RUN — no changes written)' : ''}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Invoices scanned:        ${allInvoices.length}`);
  console.log(`  Line items processed:    ${totalItemsProcessed}`);
  console.log(`  Unique products found:   ${salesMap.size}`);
  console.log(`  Sales created:           ${salesCreated}`);
  console.log(`  Sales updated:           ${salesUpdated}`);
  console.log(`  Sales already correct:   ${salesSkipped}`);
  console.log(`  Purchase stubs created:  ${purchaseCreated}`);
  console.log(`  Purchase already existed:${purchaseSkipped}`);
  if (invoicesMissingProductKey > 0) {
    console.log(`  Invoices backfilled:     ${invoicesMissingProductKey}`);
  }
  console.log(`${'═'.repeat(60)}\n`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
