const express = require('express');
const PurchaseOrder = require('../models/PurchaseOrder');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { financialValidationMiddleware } = require('../utils/calcEngine');
const { getFinancialYear } = require('../utils/financialYear');
const { convertToWords } = require('../utils/numberToWords');
const { poBodySchema } = require('../validation/schemas');

const router = express.Router();

// GET /api/po/:year
router.get('/:year', authenticate, async (req, res) => {
  try {
    const { year } = req.params;
    const pos = await PurchaseOrder.find({ financialYear: year, userId: req.user.userId }).sort({ poNumber: 1 });
    res.json(pos);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json([]);
  }
});

// GET /api/po/id/:id
router.get('/id/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const po = await PurchaseOrder.findOne({ _id: id, userId: req.user.userId });
    if (!po) return res.status(404).json({ message: 'Purchase Order not found' });
    res.json(po);
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/po
router.post('/', authenticate, validate(poBodySchema), financialValidationMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const financialYear = getFinancialYear(d.date);
    const grandTotal = d.grandTotal || 0;
    const totalInWords = convertToWords(grandTotal);

    const newPO = new PurchaseOrder({
      poNumber: d.poNumber,
      date: d.date,
      supplierName: d.supplierName,
      supplierAddress: d.supplierAddress,
      supplierGst: d.supplierGst,
      subject: d.subject,
      reference: d.reference,
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
      notes: d.notes,
      userId: req.user.userId,
      financialYear,
      totalInWords,
    });

    await newPO.save();
    res.status(201).json(newPO);
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/po/:id
router.put('/:id', authenticate, validate(poBodySchema), financialValidationMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    const financialYear = getFinancialYear(d.date);

    const updatedPO = await PurchaseOrder.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      {
        poNumber: d.poNumber,
        date: d.date,
        supplierName: d.supplierName,
        supplierAddress: d.supplierAddress,
        supplierGst: d.supplierGst,
        subject: d.subject,
        reference: d.reference,
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
        notes: d.notes,
        financialYear,
      },
      { new: true, runValidators: true }
    );

    if (!updatedPO) return res.status(404).json({ message: 'Purchase Order not found' });
    res.json(updatedPO);
  } catch (error) {
    console.error('Error updating purchase order:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/po/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedPO = await PurchaseOrder.findOneAndDelete({ _id: id, userId: req.user.userId });
    if (!deletedPO) return res.status(404).json({ message: 'Purchase Order not found' });
    res.json({ message: 'Purchase Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
