const express = require('express');
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const InventoryItem = require('../models/InventoryItem');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { financialValidationMiddleware } = require('../utils/calcEngine');
const { getFinancialYear } = require('../utils/financialYear');
const { convertToWords } = require('../utils/numberToWords');
const { normalizeProductKey, computeStockStatus } = require('../utils/productUtils');
const { invoiceBodySchema, paymentStatusSchema } = require('../validation/schemas');

const router = express.Router();

// GET /api/invoices/:year
router.get('/:year', authenticate, async (req, res) => {
  try {
    const { year } = req.params;
    const invoices = await Invoice.find({ financialYear: year, userId: req.user.userId }).sort({ invoiceNumber: 1 });
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json([]);
  }
});

// GET /api/invoices/:year/product/:productKey
router.get('/:year/product/:productKey', authenticate, async (req, res) => {
  try {
    const { year, productKey } = req.params;
    const invoices = await Invoice.find({
      userId: req.user.userId,
      financialYear: year,
      "items.productKey": productKey
    }).select('buyerName buyerGst invoiceNumber date items').sort({ date: -1 });

    res.json(invoices);
  } catch (error) {
    console.error('Error fetching product buyers:', error);
    res.status(500).json([]);
  }
});

// GET /api/invoices/id/:id
router.get('/id/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await Invoice.findOne({ _id: id, userId: req.user.userId });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/invoices
router.post('/', authenticate, validate(invoiceBodySchema), financialValidationMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const d = req.body;
    const financialYear = getFinancialYear(d.date);
    const grandTotal = d.grandTotal || 0;
    const totalInWords = convertToWords(grandTotal);
    const invoiceType = d.invoiceType || 'Product';
    const isProductInvoice = invoiceType === 'Product';

    // ─── Pre-validation: Check stock availability (Product only) ─────────
    if (isProductInvoice) {
      const stockErrors = [];
      for (const item of d.items) {
        const productKey = normalizeProductKey(item.description);
        if (!productKey) continue;

        const masterRecord = await InventoryItem.findOne({
          userId: req.user.userId,
          productKey,
          financialYear,
          transactionType: 'Purchase',
        }).sort({ updatedAt: -1 }).session(session);

        const currentStock = masterRecord ? (masterRecord.currentStock || 0) : 0;
        if (currentStock < item.quantity) {
          stockErrors.push(`Out of stock for ${item.description}. Available: ${currentStock}, Required: ${item.quantity}`);
        }
      }

      if (stockErrors.length > 0) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Stock validation failed', errors: stockErrors });
      }
    }

    const newInvoice = new Invoice({
      invoiceNumber: d.invoiceNumber,
      date: d.date,
      buyerName: d.buyerName,
      buyerAddress: d.buyerAddress,
      buyerGst: d.buyerGst,
      buyerPan: d.buyerPan,
      buyerMsme: d.buyerMsme,
      vessel: d.vessel,
      poNumber: d.poNumber,
      dcNumber: d.dcNumber,
      ewayBillNo: d.ewayBillNo,
      items: d.items.map(item => ({
        ...item,
        productKey: normalizeProductKey(item.description)
      })),
      taxType: d.taxType,
      discountEnabled: d.discountEnabled,
      discountPercentage: d.discountPercentage,
      discountAmount: d.discountAmount,
      discountType: d.discountType,
      discountFixedAmount: d.discountFixedAmount,
      subTotal: d.subTotal,
      totalSgst: d.totalSgst,
      totalCgst: d.totalCgst,
      totalIgst: d.totalIgst,
      grandTotal,
      paymentStatus: d.paymentStatus,
      userId: req.user.userId,
      financialYear,
      totalInWords,
      invoiceType,
    });

    await newInvoice.save({ session });

    // ─── Stock deduction (Product invoices only) ─────────────────────────
    const stockWarnings = [];
    if (isProductInvoice) {
      for (const item of d.items) {
        const productKey = normalizeProductKey(item.description);
        if (!productKey) continue;

        // C1 fix: Include financialYear in deduction query
        const masterRecord = await InventoryItem.findOne({
          userId: req.user.userId,
          productKey,
          financialYear,
          transactionType: 'Purchase',
        }).sort({ updatedAt: -1 }).session(session);

        if (masterRecord) {
          const previousStock = masterRecord.currentStock || 0;
          const newStock = previousStock - item.quantity;
          const newStatus = computeStockStatus(newStock);

          await InventoryItem.updateOne(
            { _id: masterRecord._id },
            { $set: { currentStock: newStock, status: newStatus } }
          ).session(session);

          if (newStock < 0) {
            stockWarnings.push({
              description: item.description,
              previousStock,
              soldQty: item.quantity,
              currentStock: newStock,
            });
          }
        }

        // Find existing Sales record or create a new one
        const existingSales = await InventoryItem.findOne({
          userId: req.user.userId,
          productKey,
          financialYear,
          transactionType: 'Sales'
        }).session(session);

        if (existingSales) {
          await InventoryItem.updateOne(
            { _id: existingSales._id },
            { $inc: { quantity: item.quantity } }
          ).session(session);
        } else {
          await InventoryItem.create([{
            description: item.description,
            hsnSacCode: item.hsnSacCode || '',
            quantity: item.quantity,
            unit: item.unit || 'Nos',
            rate: item.rate || 0,
            transactionType: 'Sales',
            status: 'In Stock',
            financialYear,
            userId: req.user.userId,
            productKey,
          }], { session });
        }
      }
    }

    await session.commitTransaction();

    // Return invoice with optional stock warnings
    const response = newInvoice.toObject();
    if (stockWarnings.length > 0) {
      response.stockWarnings = stockWarnings;
    }
    res.status(201).json(response);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Error creating invoice:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    session.endSession();
  }
});

// PUT /api/invoices/:id
// C3 fix: Handles all type transitions (Product↔Service) correctly.
router.put('/:id', authenticate, validate(invoiceBodySchema), financialValidationMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { id } = req.params;
    const d = req.body;
    const financialYear = getFinancialYear(d.date);

    // 1. Fetch Existing Invoice
    const existingInvoice = await Invoice.findOne({ _id: id, userId: req.user.userId }).session(session);
    if (!existingInvoice) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const oldFY = existingInvoice.financialYear;
    const newFY = financialYear;

    // C3: Detect BOTH old and new invoice types for proper delta computation
    const oldType = existingInvoice.invoiceType || 'Product';
    const newType = d.invoiceType || 'Product';
    const oldIsProduct = oldType === 'Product';
    const newIsProduct = newType === 'Product';

    // 2. Compute Net Delta Map
    // Only compute if at least one side involves inventory
    const itemDeltas = {};
    const stockErrors = [];

    // Reverse old items ONLY if old type was Product
    if (oldIsProduct) {
      for (const item of existingInvoice.items) {
        const pk = item.productKey || normalizeProductKey(item.description);
        if (!pk) continue;
        const key = `${oldFY}|${pk}`;
        itemDeltas[key] = (itemDeltas[key] || 0) - item.quantity;
      }
    }

    // Apply new items ONLY if new type is Product
    if (newIsProduct) {
      for (const item of d.items) {
        const pk = normalizeProductKey(item.description);
        if (!pk) continue;
        const key = `${newFY}|${pk}`;
        itemDeltas[key] = (itemDeltas[key] || 0) + item.quantity;
      }
    }

    // 3. Pre-validate stock for positive deltas
    if (oldIsProduct || newIsProduct) {
      for (const key of Object.keys(itemDeltas)) {
        const delta = itemDeltas[key];
        if (delta > 0) {
          const [fy, pk] = key.split('|');
          const masterRecord = await InventoryItem.findOne({
            userId: req.user.userId,
            productKey: pk,
            financialYear: fy,
            transactionType: 'Purchase'
          }).sort({ updatedAt: -1 }).session(session);

          const currentStock = masterRecord ? (masterRecord.currentStock || 0) : 0;
          if (currentStock < delta) {
            const itemDesc = d.items.find(i => normalizeProductKey(i.description) === pk)?.description || pk;
            stockErrors.push(`Out of stock for ${itemDesc}. Available: ${currentStock}, Additional Required: ${delta}`);
          }
        }
      }

      if (stockErrors.length > 0) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Stock validation failed', errors: stockErrors });
      }
    }

    // 4. Execute the invoice update
    const updatedInvoice = await Invoice.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      {
        invoiceNumber: d.invoiceNumber,
        date: d.date,
        buyerName: d.buyerName,
        buyerAddress: d.buyerAddress,
        buyerGst: d.buyerGst,
        buyerPan: d.buyerPan,
        buyerMsme: d.buyerMsme,
        vessel: d.vessel,
        poNumber: d.poNumber,
        dcNumber: d.dcNumber,
        ewayBillNo: d.ewayBillNo,
        items: d.items.map(item => ({
          ...item,
          productKey: normalizeProductKey(item.description)
        })),
        taxType: d.taxType,
        discountEnabled: d.discountEnabled,
        discountPercentage: d.discountPercentage,
        discountAmount: d.discountAmount,
        discountType: d.discountType,
        discountFixedAmount: d.discountFixedAmount,
        subTotal: d.subTotal,
        totalSgst: d.totalSgst,
        totalCgst: d.totalCgst,
        totalIgst: d.totalIgst,
        grandTotal: d.grandTotal,
        totalInWords: d.totalInWords,
        paymentStatus: d.paymentStatus,
        financialYear: newFY,
        invoiceType: newType,
      },
      { new: true, runValidators: true, session }
    );

    // 5. Apply Stock Deltas to Inventory
    const stockWarnings = [];
    if (oldIsProduct || newIsProduct) {
      for (const key of Object.keys(itemDeltas)) {
        const delta = itemDeltas[key];
        if (delta === 0) continue;
        
        const [fy, pk] = key.split('|');

        // Update Purchase (Stock)
        const masterRecord = await InventoryItem.findOne({
          userId: req.user.userId,
          productKey: pk,
          financialYear: fy,
          transactionType: 'Purchase'
        }).sort({ updatedAt: -1 }).session(session);

        if (masterRecord) {
          const previousStock = masterRecord.currentStock || 0;
          const newStock = previousStock - delta;
          const newStatus = computeStockStatus(newStock);

          await InventoryItem.updateOne(
            { _id: masterRecord._id },
            { $set: { currentStock: newStock, status: newStatus } }
          ).session(session);

          if (newStock < 0) {
            stockWarnings.push({
              description: pk,
              previousStock,
              soldQty: delta,
              currentStock: newStock,
            });
          }
        }

        // Update Sales (Consumption)
        const salesRecord = await InventoryItem.findOne({
          userId: req.user.userId,
          productKey: pk,
          financialYear: fy,
          transactionType: 'Sales'
        }).session(session);

        if (salesRecord) {
          const newSalesQty = Math.max(0, salesRecord.quantity + delta);
          await InventoryItem.updateOne(
            { _id: salesRecord._id },
            { $set: { quantity: newSalesQty } }
          ).session(session);
        } else if (delta > 0) {
          const itemDetails = d.items.find(i => normalizeProductKey(i.description) === pk);
          if (itemDetails) {
            await InventoryItem.create([{
              description: itemDetails.description,
              hsnSacCode: itemDetails.hsnSacCode || '',
              quantity: delta,
              unit: itemDetails.unit || 'Nos',
              rate: itemDetails.rate || 0,
              transactionType: 'Sales',
              status: 'In Stock',
              financialYear: fy,
              userId: req.user.userId,
              productKey: pk,
            }], { session });
          }
        }
      }
    }

    await session.commitTransaction();

    const response = updatedInvoice.toObject();
    if (stockWarnings.length > 0) {
      response.stockWarnings = stockWarnings;
    }
    res.json(response);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Error updating invoice:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    session.endSession();
  }
});

// PATCH /api/invoices/:id/payment-status
router.patch('/:id/payment-status', authenticate, validate(paymentStatusSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // already validated by Zod

    const updatedInvoice = await Invoice.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { paymentStatus: status },
      { new: true }
    );

    if (!updatedInvoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json(updatedInvoice);
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/invoices/:id
router.delete('/:id', authenticate, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { id } = req.params;
    const deletedInvoice = await Invoice.findOneAndDelete({ _id: id, userId: req.user.userId }).session(session);

    if (!deletedInvoice) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Restore stock and reduce sales (Product invoices only)
    const isProductInvoice = (deletedInvoice.invoiceType || 'Product') === 'Product';
    if (isProductInvoice) {
      const financialYear = deletedInvoice.financialYear;
      for (const item of deletedInvoice.items) {
        const productKey = normalizeProductKey(item.description);
        if (!productKey) continue;

        // Restore Purchase stock
        const masterRecord = await InventoryItem.findOne({
          userId: req.user.userId,
          productKey,
          financialYear,
          transactionType: 'Purchase',
        }).sort({ updatedAt: -1 }).session(session);

        if (masterRecord) {
          const restoredStock = (masterRecord.currentStock || 0) + item.quantity;
          const newStatus = computeStockStatus(restoredStock);
          await InventoryItem.updateOne(
            { _id: masterRecord._id },
            { $set: { currentStock: restoredStock, status: newStatus } }
          ).session(session);
        }

        // Reduce Sales entry
        const salesRecord = await InventoryItem.findOne({
          userId: req.user.userId,
          productKey,
          financialYear,
          transactionType: 'Sales',
        }).session(session);

        if (salesRecord) {
          const newSalesQty = Math.max(0, salesRecord.quantity - item.quantity);
          await InventoryItem.updateOne(
            { _id: salesRecord._id },
            { $set: { quantity: newSalesQty } }
          ).session(session);
        }
      }
    }

    await session.commitTransaction();
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Error deleting invoice:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    session.endSession();
  }
});

module.exports = router;
