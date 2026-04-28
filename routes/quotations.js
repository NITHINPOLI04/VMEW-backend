const express = require('express');
const Quotation = require('../models/Quotation');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { financialValidationMiddleware } = require('../utils/calcEngine');
const { getFinancialYear } = require('../utils/financialYear');
const { quotationBodySchema } = require('../validation/schemas');

const router = express.Router();

// GET /api/quotation/:year
router.get('/:year', authenticate, async (req, res) => {
  try {
    const { year } = req.params;
    const quotations = await Quotation.find({ financialYear: year, userId: req.user.userId }).sort({ quotationNumber: 1 });
    res.json(quotations);
  } catch (error) {
    console.error('Error fetching quotations:', error);
    res.status(500).json([]);
  }
});

// GET /api/quotation/id/:id
router.get('/id/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const quotation = await Quotation.findOne({ _id: id, userId: req.user.userId });
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
    res.json(quotation);
  } catch (error) {
    console.error('Error fetching quotation:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/quotation
router.post('/', authenticate, validate(quotationBodySchema), financialValidationMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const financialYear = getFinancialYear(d.date);

    const newQuotation = new Quotation({
      quotationNumber: d.quotationNumber,
      date: d.date,
      buyerName: d.buyerName,
      buyerAddress: d.buyerAddress,
      buyerGst: d.buyerGst,
      refNumber: d.refNumber,
      enqNumber: d.enqNumber,
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
      deliveryTerms: d.deliveryTerms,
      paymentTerms: d.paymentTerms,
      guarantee: d.guarantee,
      validity: d.validity,
      grandTotal: d.grandTotal,
      totalInWords: d.totalInWords,
      userId: req.user.userId,
      financialYear,
    });

    await newQuotation.save();
    res.status(201).json(newQuotation);
  } catch (error) {
    console.error('Error creating quotation:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/quotation/:id
router.put('/:id', authenticate, validate(quotationBodySchema), financialValidationMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    const financialYear = getFinancialYear(d.date);

    const updatedQuotation = await Quotation.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      {
        quotationNumber: d.quotationNumber,
        date: d.date,
        buyerName: d.buyerName,
        buyerAddress: d.buyerAddress,
        buyerGst: d.buyerGst,
        refNumber: d.refNumber,
        enqNumber: d.enqNumber,
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
        deliveryTerms: d.deliveryTerms,
        paymentTerms: d.paymentTerms,
        guarantee: d.guarantee,
        validity: d.validity,
        grandTotal: d.grandTotal,
        totalInWords: d.totalInWords,
        financialYear,
      },
      { new: true, runValidators: true }
    );

    if (!updatedQuotation) return res.status(404).json({ message: 'Quotation not found' });
    res.json(updatedQuotation);
  } catch (error) {
    console.error('Error updating quotation:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/quotation/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedQuotation = await Quotation.findOneAndDelete({ _id: id, userId: req.user.userId });
    if (!deletedQuotation) return res.status(404).json({ message: 'Quotation not found' });
    res.json({ message: 'Quotation deleted successfully' });
  } catch (error) {
    console.error('Error deleting quotation:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
