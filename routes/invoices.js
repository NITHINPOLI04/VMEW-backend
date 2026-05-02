const express = require('express');
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
const PAYMENT_STATUSES = ['Payment Complete', 'Partially Paid', 'Unpaid'];

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
  try {
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
      }).sort({ updatedAt: -1 });

      const currentStock = masterRecord ? (masterRecord.currentStock || 0) : 0;
      if (currentStock < item.quantity) {
        stockErrors.push(`Out of stock for ${item.description}. Available: ${currentStock}, Required: ${item.quantity}`);
      }
    }

    if (stockErrors.length > 0) {
      return res.status(400).json({ message: 'Stock validation failed', errors: stockErrors });
    }
    } // end isProductInvoice pre-validation

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

    await newInvoice.save();

    // ─── Stock deduction (Product invoices only) ─────────────────────────
    const stockWarnings = [];
    if (isProductInvoice) {
    for (const item of d.items) {
      const productKey = normalizeProductKey(item.description);
      if (!productKey) continue;

      // Find the latest Purchase master record for this product
      const masterRecord = await InventoryItem.findOne({
        userId: req.user.userId,
        productKey,
        transactionType: 'Purchase',
      }).sort({ updatedAt: -1 });

      if (masterRecord) {
        const previousStock = masterRecord.currentStock || 0;
        const newStock = previousStock - item.quantity;
        const newStatus = computeStockStatus(newStock);

        // Deduct from master record
        await InventoryItem.updateOne(
          { _id: masterRecord._id },
          { $set: { currentStock: newStock, status: newStatus } }
        );

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
      });

      if (existingSales) {
        await InventoryItem.updateOne(
          { _id: existingSales._id },
          { $inc: { quantity: item.quantity } }
        );
      } else {
        await InventoryItem.create({
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
          currentStock: 0,
        });
      }
    }
    } // end isProductInvoice stock deduction

    // Return invoice with optional stock warnings
    const response = newInvoice.toObject();
    if (stockWarnings.length > 0) {
      response.stockWarnings = stockWarnings;
    }
    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/invoices/:id
router.put('/:id', authenticate, validate(invoiceBodySchema), financialValidationMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    const financialYear = getFinancialYear(d.date);

    // 1. Fetch Existing Invoice
    const existingInvoice = await Invoice.findOne({ _id: id, userId: req.user.userId });
    if (!existingInvoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const oldFY = existingInvoice.financialYear;
    const newFY = financialYear;
    const invoiceType = d.invoiceType || existingInvoice.invoiceType || 'Product';
    const isProductInvoice = invoiceType === 'Product';

    // 2. Compute Net Delta Map (Product invoices only)
    let itemDeltas = {};
    let stockErrors = [];

    if (isProductInvoice) {
    // +X means we need to deduct X more from stock (and add to sales)
    // -Y means we need to restore Y to stock (and subtract from sales)
    
    // Subtract old items (reversal)
    for (const item of existingInvoice.items) {
      const pk = item.productKey || normalizeProductKey(item.description);
      if (!pk) continue;
      const key = `${oldFY}|${pk}`;
      itemDeltas[key] = (itemDeltas[key] || 0) - item.quantity;
    }

    // Add new items (application)
    for (const item of d.items) {
      const pk = normalizeProductKey(item.description);
      if (!pk) continue;
      const key = `${newFY}|${pk}`;
      itemDeltas[key] = (itemDeltas[key] || 0) + item.quantity;
    }

    // 3. Pre-validate stock availability for POSITIVE deltas
    for (const key of Object.keys(itemDeltas)) {
      const delta = itemDeltas[key];
      if (delta > 0) {
        const [fy, pk] = key.split('|');
        const masterRecord = await InventoryItem.findOne({
          userId: req.user.userId,
          productKey: pk,
          financialYear: fy,
          transactionType: 'Purchase'
        }).sort({ updatedAt: -1 });

        const currentStock = masterRecord ? (masterRecord.currentStock || 0) : 0;
        if (currentStock < delta) {
          const itemDesc = d.items.find(i => normalizeProductKey(i.description) === pk)?.description || pk;
          stockErrors.push(`Out of stock for ${itemDesc}. Available: ${currentStock}, Additional Required: ${delta}`);
        }
      }
    }

    if (stockErrors.length > 0) {
      return res.status(400).json({ message: 'Stock validation failed', errors: stockErrors });
    }
    } // end isProductInvoice delta + validation

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
        invoiceType,
      },
      { new: true, runValidators: true }
    );

    // 5. Apply Stock Deltas to Inventory (Product invoices only)
    const stockWarnings = [];
    if (isProductInvoice) {
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
      }).sort({ updatedAt: -1 });

      if (masterRecord) {
        const previousStock = masterRecord.currentStock || 0;
        const newStock = previousStock - delta;
        const newStatus = computeStockStatus(newStock);

        await InventoryItem.updateOne(
          { _id: masterRecord._id },
          { $set: { currentStock: newStock, status: newStatus } }
        );

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
      });

      if (salesRecord) {
        const newSalesQty = Math.max(0, salesRecord.quantity + delta);
        await InventoryItem.updateOne(
          { _id: salesRecord._id },
          { $set: { quantity: newSalesQty } }
        );
      } else if (delta > 0) {
        // Find the item details from the new request items to create a sales record
        const itemDetails = d.items.find(i => normalizeProductKey(i.description) === pk);
        if (itemDetails) {
          await InventoryItem.create({
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
            currentStock: 0
          });
        }
      }
    }
    } // end isProductInvoice stock application

    const response = updatedInvoice.toObject();
    if (stockWarnings.length > 0) {
      response.stockWarnings = stockWarnings;
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ message: 'Internal server error' });
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
  try {
    const { id } = req.params;
    const deletedInvoice = await Invoice.findOneAndDelete({ _id: id, userId: req.user.userId });

    if (!deletedInvoice) {
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
      }).sort({ updatedAt: -1 });

      if (masterRecord) {
        const restoredStock = (masterRecord.currentStock || 0) + item.quantity;
        const newStatus = computeStockStatus(restoredStock);
        await InventoryItem.updateOne(
          { _id: masterRecord._id },
          { $set: { currentStock: restoredStock, status: newStatus } }
        );
      }

      // Reduce Sales entry
      const salesRecord = await InventoryItem.findOne({
        userId: req.user.userId,
        productKey,
        financialYear,
        transactionType: 'Sales',
      });

      if (salesRecord) {
        const newSalesQty = Math.max(0, salesRecord.quantity - item.quantity);
        await InventoryItem.updateOne(
          { _id: salesRecord._id },
          { $set: { quantity: newSalesQty } }
        );
      }
    }
    } // end isProductInvoice
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
