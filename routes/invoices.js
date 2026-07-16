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

// ─── HSN Summary Calculator Endpoints ─────────────────────────────────────────
// These MUST be defined before /:year to avoid route parameter collision.

// GET /api/invoices/hsn-summary?year=2026-2027&from=2026-04-01&to=2027-03-31
router.get('/hsn-summary', authenticate, async (req, res) => {
  try {
    const { year, from, to } = req.query;
    if (!year || !from || !to) {
      return res.status(400).json({ message: 'year, from, and to query params are required' });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const matchStage = {
      userId: new mongoose.Types.ObjectId(req.user.userId),
      financialYear: year,
      date: { $gte: fromDate, $lte: toDate },
      $or: [
        { documentType: 'invoice' },
        { documentType: { $exists: false } },
        { documentType: null },
      ],
    };

    const pipeline = [
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            hsnSacCode: '$items.hsnSacCode',
            unit: '$items.unit',
            taxType: '$taxType',
          },
          description: { $first: '$items.description' },
          totalQty: { $sum: '$items.quantity' },
          totalTaxableAmt: { $sum: '$items.taxableAmount' },
          totalSgstAmt: { $sum: { $ifNull: ['$items.sgstAmount', 0] } },
          totalCgstAmt: { $sum: { $ifNull: ['$items.cgstAmount', 0] } },
          totalIgstAmt: { $sum: { $ifNull: ['$items.igstAmount', 0] } },
          invoiceNumbers: { $addToSet: '$invoiceNumber' },
        },
      },
      {
        $project: {
          _id: 0,
          hsnSacCode: '$_id.hsnSacCode',
          unit: '$_id.unit',
          taxType: '$_id.taxType',
          description: 1,
          totalQty: 1,
          totalTaxableAmt: { $round: ['$totalTaxableAmt', 2] },
          totalSgstAmt: { $round: ['$totalSgstAmt', 2] },
          totalCgstAmt: { $round: ['$totalCgstAmt', 2] },
          totalIgstAmt: { $round: ['$totalIgstAmt', 2] },
          totalValue: {
            $round: [
              { $add: ['$totalTaxableAmt', '$totalSgstAmt', '$totalCgstAmt', '$totalIgstAmt'] },
              2,
            ],
          },
          invoiceCount: { $size: '$invoiceNumbers' },
        },
      },
      { $sort: { hsnSacCode: 1, unit: 1 } },
    ];

    const summary = await Invoice.aggregate(pipeline);

    // Compute grand totals
    const distinctHsnCodes = new Set(summary.map(r => r.hsnSacCode));
    const allInvoiceNumbers = new Set();
    // Re-run a lightweight distinct query for accurate invoice count
    const invoiceDocs = await Invoice.distinct('invoiceNumber', matchStage);

    const totals = {
      totalTaxableAmt: summary.reduce((s, r) => s + r.totalTaxableAmt, 0),
      totalSgstAmt: summary.reduce((s, r) => s + r.totalSgstAmt, 0),
      totalCgstAmt: summary.reduce((s, r) => s + r.totalCgstAmt, 0),
      totalIgstAmt: summary.reduce((s, r) => s + r.totalIgstAmt, 0),
      totalValue: summary.reduce((s, r) => s + r.totalValue, 0),
      distinctHsnCount: distinctHsnCodes.size,
      invoiceCount: invoiceDocs.length,
    };

    res.json({ summary, totals });
  } catch (error) {
    console.error('Error generating HSN summary:', error);
    res.status(500).json({ message: 'Failed to generate HSN summary' });
  }
});

// GET /api/invoices/hsn-detail?year=2026-2027&from=2026-04-01&to=2027-03-31
router.get('/hsn-detail', authenticate, async (req, res) => {
  try {
    const { year, from, to } = req.query;
    if (!year || !from || !to) {
      return res.status(400).json({ message: 'year, from, and to query params are required' });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const matchStage = {
      userId: new mongoose.Types.ObjectId(req.user.userId),
      financialYear: year,
      date: { $gte: fromDate, $lte: toDate },
      $or: [
        { documentType: 'invoice' },
        { documentType: { $exists: false } },
        { documentType: null },
      ],
    };

    const pipeline = [
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $project: {
          _id: 0,
          invoiceNumber: 1,
          date: 1,
          buyerName: 1,
          buyerGst: 1,
          taxType: 1,
          hsnSacCode: '$items.hsnSacCode',
          description: '$items.description',
          quantity: '$items.quantity',
          unit: '$items.unit',
          rate: '$items.rate',
          taxableAmount: '$items.taxableAmount',
          sgstPercentage: { $ifNull: ['$items.sgstPercentage', 0] },
          sgstAmount: { $ifNull: ['$items.sgstAmount', 0] },
          cgstPercentage: { $ifNull: ['$items.cgstPercentage', 0] },
          cgstAmount: { $ifNull: ['$items.cgstAmount', 0] },
          igstPercentage: { $ifNull: ['$items.igstPercentage', 0] },
          igstAmount: { $ifNull: ['$items.igstAmount', 0] },
        },
      },
      { $sort: { hsnSacCode: 1, invoiceNumber: 1 } },
    ];

    const rows = await Invoice.aggregate(pipeline);
    res.json({ rows });
  } catch (error) {
    console.error('Error generating HSN detail:', error);
    res.status(500).json({ message: 'Failed to generate HSN detail' });
  }
});

// GET /api/invoices/:year
// Optional query param: ?documentType=invoice|credit_note|debit_note
// Legacy documents (pre-migration) have no documentType field — treated as 'invoice'.
router.get('/:year', authenticate, async (req, res) => {
  try {
    const { year } = req.params;
    const { documentType = 'invoice' } = req.query;

    const baseFilter = { financialYear: year, userId: req.user.userId };

    let filter;
    if (documentType === 'invoice') {
      // Include explicitly-tagged invoices AND legacy docs without the field.
      filter = {
        ...baseFilter,
        $or: [
          { documentType: 'invoice' },
          { documentType: { $exists: false } },
          { documentType: null },
        ],
      };
    } else {
      // credit_note / debit_note — newly created, field always set.
      filter = { ...baseFilter, documentType };
    }

    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit);

    if (!isNaN(page) && !isNaN(limit) && page > 0 && limit > 0) {
      const skip = (page - 1) * limit;
      const [docs, totalDocs] = await Promise.all([
        Invoice.find(filter).sort({ invoiceNumber: 1 }).skip(skip).limit(limit),
        Invoice.countDocuments(filter),
      ]);
      return res.json({
        docs,
        totalDocs,
        totalPages: Math.ceil(totalDocs / limit),
        page,
        limit,
      });
    }

    const invoices = await Invoice.find(filter).sort({ invoiceNumber: 1 });
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
    const documentType = d.documentType || 'invoice';
    // Product type documents affect inventory.
    const affectsInventory = invoiceType === 'Product';
    const deductsStock = affectsInventory && (documentType === 'invoice' || documentType === 'debit_note');

    // ─── Pre-validation: Check stock availability (Product only, when deducting stock) ─────────
    if (deductsStock) {
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
      documentType,
      linkedInvoiceId: d.linkedInvoiceId || null,
      linkedInvoiceNumber: d.linkedInvoiceNumber || null,
      reason: d.reason || null,
    });

    await newInvoice.save({ session });

    // ─── Inventory Stock adjustments ─────────────────────────
    const stockWarnings = [];
    if (affectsInventory) {
      const multiplier = documentType === 'credit_note' ? 1 : -1;
      for (const item of d.items) {
        const productKey = normalizeProductKey(item.description);
        if (!productKey) continue;

        const masterRecord = await InventoryItem.findOne({
          userId: req.user.userId,
          productKey,
          financialYear,
          transactionType: 'Purchase',
        }).sort({ updatedAt: -1 }).session(session);

        if (masterRecord) {
          const previousStock = masterRecord.currentStock || 0;
          const newStock = previousStock + (multiplier * item.quantity);
          const newStatus = computeStockStatus(newStock);

          await InventoryItem.updateOne(
            { _id: masterRecord._id },
            { $set: { currentStock: newStock, status: newStatus } }
          ).session(session);

          if (newStock < 0 && multiplier < 0) {
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

        const salesChange = -multiplier * item.quantity;
        if (existingSales) {
          const newSalesQty = Math.max(0, existingSales.quantity + salesChange);
          await InventoryItem.updateOne(
            { _id: existingSales._id },
            { $set: { quantity: newSalesQty } }
          ).session(session);
        } else if (salesChange > 0) {
          await InventoryItem.create([{
            description: item.description,
            hsnSacCode: item.hsnSacCode || '',
            quantity: salesChange,
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
    if (error.code === 11000) {
      return res.status(409).json({ message: `An invoice with this number already exists for this financial year.` });
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
    const oldDocType = existingInvoice.documentType || 'invoice';
    const newDocType = d.documentType || 'invoice';
    // C3: Detect BOTH old and new document types/multipliers for inventory stock impact
    const oldAffectsInventory = oldType === 'Product';
    const newAffectsInventory = newType === 'Product';
    const oldMultiplier = oldDocType === 'credit_note' ? 1 : -1;
    const newMultiplier = newDocType === 'credit_note' ? 1 : -1;

    // 2. Compute Net Delta Map for Stock and Sales
    const stockDeltas = {};
    const salesDeltas = {};
    const stockErrors = [];

    // Reverse old items ONLY if old document affected inventory
    if (oldAffectsInventory) {
      for (const item of existingInvoice.items) {
        const pk = item.productKey || normalizeProductKey(item.description);
        if (!pk) continue;
        const key = `${oldFY}|${pk}`;
        const oldStockImpact = oldMultiplier * item.quantity;
        const oldSalesImpact = -oldMultiplier * item.quantity;
        stockDeltas[key] = (stockDeltas[key] || 0) - oldStockImpact;
        salesDeltas[key] = (salesDeltas[key] || 0) - oldSalesImpact;
      }
    }

    // Apply new items ONLY if new document affects inventory
    if (newAffectsInventory) {
      for (const item of d.items) {
        const pk = normalizeProductKey(item.description);
        if (!pk) continue;
        const key = `${newFY}|${pk}`;
        const newStockImpact = newMultiplier * item.quantity;
        const newSalesImpact = -newMultiplier * item.quantity;
        stockDeltas[key] = (stockDeltas[key] || 0) + newStockImpact;
        salesDeltas[key] = (salesDeltas[key] || 0) + newSalesImpact;
      }
    }

    // 3. Pre-validate stock for negative stock deltas (stock is being reduced)
    if (oldAffectsInventory || newAffectsInventory) {
      for (const key of Object.keys(stockDeltas)) {
        const delta = stockDeltas[key];
        if (delta < 0) {
          const [fy, pk] = key.split('|');
          const masterRecord = await InventoryItem.findOne({
            userId: req.user.userId,
            productKey: pk,
            financialYear: fy,
            transactionType: 'Purchase'
          }).sort({ updatedAt: -1 }).session(session);

          const currentStock = masterRecord ? (masterRecord.currentStock || 0) : 0;
          const requiredQty = Math.abs(delta);
          if (currentStock < requiredQty) {
            const itemDesc = d.items.find(i => normalizeProductKey(i.description) === pk)?.description || pk;
            stockErrors.push(`Out of stock for ${itemDesc}. Available: ${currentStock}, Additional Required: ${requiredQty}`);
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
        documentType: newDocType,
        linkedInvoiceId: d.linkedInvoiceId || null,
        linkedInvoiceNumber: d.linkedInvoiceNumber || null,
        reason: d.reason || null,
      },
      { new: true, runValidators: true, session }
    );

    // 5. Apply Stock Deltas to Inventory
    const stockWarnings = [];
    if (oldAffectsInventory || newAffectsInventory) {
      // Apply Purchase stock changes
      for (const key of Object.keys(stockDeltas)) {
        const delta = stockDeltas[key];
        if (delta === 0) continue;
        
        const [fy, pk] = key.split('|');

        const masterRecord = await InventoryItem.findOne({
          userId: req.user.userId,
          productKey: pk,
          financialYear: fy,
          transactionType: 'Purchase'
        }).sort({ updatedAt: -1 }).session(session);

        if (masterRecord) {
          const previousStock = masterRecord.currentStock || 0;
          const newStock = previousStock + delta;
          const newStatus = computeStockStatus(newStock);

          await InventoryItem.updateOne(
            { _id: masterRecord._id },
            { $set: { currentStock: newStock, status: newStatus } }
          ).session(session);

          if (newStock < 0 && delta < 0) {
            stockWarnings.push({
              description: pk,
              previousStock,
              soldQty: Math.abs(delta),
              currentStock: newStock,
            });
          }
        }
      }

      // Apply Sales consumption changes
      for (const key of Object.keys(salesDeltas)) {
        const delta = salesDeltas[key];
        if (delta === 0) continue;

        const [fy, pk] = key.split('|');

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
    const { status, receivedAmount } = req.body;

    const updateData = { paymentStatus: status };
    if (receivedAmount !== undefined && typeof receivedAmount === 'number') {
      updateData.receivedAmount = Math.max(0, receivedAmount);
    }
    if (status !== 'Partially Paid') {
      updateData.receivedAmount = 0;
    }

    const updatedInvoice = await Invoice.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      updateData,
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

    // Restore stock and adjust sales accordingly (Product type documents only)
    const affectsInventory = (deletedInvoice.invoiceType || 'Product') === 'Product';
    if (affectsInventory) {
      const docType = deletedInvoice.documentType || 'invoice';
      const multiplier = docType === 'credit_note' ? -1 : 1;
      const financialYear = deletedInvoice.financialYear;
      for (const item of deletedInvoice.items) {
        const productKey = normalizeProductKey(item.description);
        if (!productKey) continue;

        // Purchase stock: Invoice/DN deduction gets added back (+item.quantity)
        // CN return gets subtracted back (-item.quantity)
        const masterRecord = await InventoryItem.findOne({
          userId: req.user.userId,
          productKey,
          financialYear,
          transactionType: 'Purchase',
        }).sort({ updatedAt: -1 }).session(session);

        if (masterRecord) {
          const restoredStock = (masterRecord.currentStock || 0) + (multiplier * item.quantity);
          const newStatus = computeStockStatus(restoredStock);
          await InventoryItem.updateOne(
            { _id: masterRecord._id },
            { $set: { currentStock: restoredStock, status: newStatus } }
          ).session(session);
        }

        // Sales entry: Invoice/DN sales gets reduced (-item.quantity)
        // CN return gets added back (+item.quantity)
        const salesRecord = await InventoryItem.findOne({
          userId: req.user.userId,
          productKey,
          financialYear,
          transactionType: 'Sales',
        }).session(session);

        if (salesRecord) {
          const newSalesQty = Math.max(0, salesRecord.quantity - (multiplier * item.quantity));
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

// GET /api/invoices/:invoiceId/notes
router.get('/:invoiceId/notes', authenticate, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({ message: 'Invalid invoice ID' });
    }
    const notes = await Invoice.find({
      userId: req.user.userId,
      linkedInvoiceId: invoiceId
    }).select('_id invoiceNumber documentType grandTotal date reason');
    res.json(notes);
  } catch (error) {
    console.error('Error fetching linked notes:', error);
    res.status(500).json([]);
  }
});

module.exports = router;
