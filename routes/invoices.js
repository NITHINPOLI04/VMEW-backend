const express = require('express');
const Invoice = require('../models/Invoice');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { financialValidationMiddleware } = require('../utils/calcEngine');
const { getFinancialYear } = require('../utils/financialYear');
const { convertToWords } = require('../utils/numberToWords');
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
      items: d.items,
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
    });

    await newInvoice.save();
    res.status(201).json(newInvoice);
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
        items: d.items,
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
        financialYear,
      },
      { new: true, runValidators: true }
    );

    if (!updatedInvoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json(updatedInvoice);
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
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
