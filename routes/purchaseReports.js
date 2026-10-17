const express = require('express');
const PurchaseReport = require('../models/PurchaseReport');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { getFinancialYear } = require('../utils/financialYear');
const { purchaseReportBodySchema, purchaseReportPaymentEntrySchema } = require('../validation/schemas');

const router = express.Router();

// GET /api/purchase-reports/:year
router.get('/:year', authenticate, async (req, res) => {
  try {
    const { year } = req.params;
    const reports = await PurchaseReport.find({
      financialYear: year,
      userId: req.user.userId,
    }).sort({ date: -1 });
    res.json(reports);
  } catch (error) {
    console.error('Error fetching purchase reports:', error);
    res.status(500).json([]);
  }
});

// GET /api/purchase-reports/id/:id
router.get('/id/:id', authenticate, async (req, res) => {
  try {
    const report = await PurchaseReport.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!report) return res.status(404).json({ message: 'Purchase Report not found' });
    res.json(report);
  } catch (error) {
    console.error('Error fetching purchase report:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/purchase-reports
router.post('/', authenticate, validate(purchaseReportBodySchema), async (req, res) => {
  try {
    const d = req.body;
    const financialYear = getFinancialYear(d.date);

    const newReport = new PurchaseReport({
      partyInvoiceNumber: d.partyInvoiceNumber,
      date: d.date,
      partyName: d.partyName,
      partyAddress: d.partyAddress || '',
      partyGst: d.partyGst || '',
      taxType: d.taxType,
      taxableValue: d.taxableValue,
      sgstPercentage: d.sgstPercentage !== undefined ? d.sgstPercentage : 9,
      cgstPercentage: d.cgstPercentage !== undefined ? d.cgstPercentage : 9,
      igstPercentage: d.igstPercentage !== undefined ? d.igstPercentage : 18,
      igstAmount: d.igstAmount || 0,
      cgstAmount: d.cgstAmount || 0,
      sgstAmount: d.sgstAmount || 0,
      totalAmount: d.totalAmount,
      notes: d.notes || '',
      userId: req.user.userId,
      financialYear,
    });

    await newReport.save();
    res.status(201).json(newReport);
  } catch (error) {
    console.error('Error creating purchase report:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/purchase-reports/:id
router.put('/:id', authenticate, validate(purchaseReportBodySchema), async (req, res) => {
  try {
    const d = req.body;
    const financialYear = getFinancialYear(d.date);

    const updated = await PurchaseReport.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      {
        partyInvoiceNumber: d.partyInvoiceNumber,
        date: d.date,
        partyName: d.partyName,
        partyAddress: d.partyAddress || '',
        partyGst: d.partyGst || '',
        taxType: d.taxType,
        taxableValue: d.taxableValue,
        sgstPercentage: d.sgstPercentage !== undefined ? d.sgstPercentage : 9,
        cgstPercentage: d.cgstPercentage !== undefined ? d.cgstPercentage : 9,
        igstPercentage: d.igstPercentage !== undefined ? d.igstPercentage : 18,
        igstAmount: d.igstAmount || 0,
        cgstAmount: d.cgstAmount || 0,
        sgstAmount: d.sgstAmount || 0,
        totalAmount: d.totalAmount,
        notes: d.notes || '',
        financialYear,
      },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: 'Purchase Report not found' });
    res.json(updated);
  } catch (error) {
    console.error('Error updating purchase report:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/purchase-reports/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const deleted = await PurchaseReport.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!deleted) return res.status(404).json({ message: 'Purchase Report not found' });
    res.json({ message: 'Purchase Report deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase report:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GST Filing Status endpoints ──────────────────────────────────────────────

// PATCH /api/purchase-reports/bulk/gst-status — mark all entries in a period as GST filed
router.patch('/bulk/gst-status', authenticate, async (req, res) => {
  try {
    const { financialYear, month, year } = req.body;
    if (!financialYear || month === undefined || month === null || !year) {
      return res.status(400).json({ message: 'financialYear, month, and year are required' });
    }

    // Build date range for the given month
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const result = await PurchaseReport.updateMany(
      {
        userId: req.user.userId,
        financialYear,
        date: { $gte: startDate, $lte: endDate },
        gstFiled: false,
      },
      {
        $set: { gstFiled: true, gstFiledDate: new Date() },
      }
    );

    // Return updated reports for the full FY so frontend can refresh
    const reports = await PurchaseReport.find({
      userId: req.user.userId,
      financialYear,
    }).sort({ date: -1 });

    res.json({ modifiedCount: result.modifiedCount, reports });
  } catch (error) {
    console.error('Error bulk updating GST status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PATCH /api/purchase-reports/:id/gst-status — toggle GST filed status for a single report
router.patch('/:id/gst-status', authenticate, async (req, res) => {
  try {
    const report = await PurchaseReport.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!report) return res.status(404).json({ message: 'Purchase Report not found' });

    const newStatus = !report.gstFiled;
    report.gstFiled = newStatus;
    report.gstFiledDate = newStatus ? new Date() : null;
    await report.save();

    res.json({ report });
  } catch (error) {
    console.error('Error toggling GST status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Payment endpoints ────────────────────────────────────────────────────────

// PUT /api/purchase-reports/:id/payment-status — quick status change (without adding payment entry)
router.put('/:id/payment-status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Payment Complete', 'Advance Paid', 'Unpaid'].includes(status)) {
      return res.status(400).json({ message: 'Invalid payment status' });
    }

    const updateFields = { paymentStatus: status };

    // If setting to Unpaid, clear all payment entries
    if (status === 'Unpaid') {
      updateFields.payments = [];
      updateFields.receivedAmount = 0;
    }

    const updated = await PurchaseReport.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      updateFields,
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: 'Purchase Report not found' });
    res.json({ report: updated });
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/purchase-reports/:id/payments — add a payment entry
router.post('/:id/payments', authenticate, validate(purchaseReportPaymentEntrySchema), async (req, res) => {
  try {
    const report = await PurchaseReport.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!report) return res.status(404).json({ message: 'Purchase Report not found' });

    const entry = {
      paymentDate: req.body.paymentDate,
      amount: req.body.amount,
      mode: req.body.mode || 'NEFT',
      referenceNumber: req.body.referenceNumber || '',
      notes: req.body.notes || '',
    };

    report.payments.push(entry);
    const totalReceived = report.payments.reduce((s, p) => s + p.amount, 0);
    report.receivedAmount = totalReceived;

    // Auto-determine payment status
    if (totalReceived >= report.totalAmount) {
      report.paymentStatus = 'Payment Complete';
    } else if (totalReceived > 0) {
      report.paymentStatus = 'Advance Paid';
    } else {
      report.paymentStatus = 'Unpaid';
    }

    await report.save();
    res.json({ report });
  } catch (error) {
    console.error('Error adding payment entry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/purchase-reports/:id/payments/:paymentId — remove a payment entry
router.delete('/:id/payments/:paymentId', authenticate, async (req, res) => {
  try {
    const report = await PurchaseReport.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!report) return res.status(404).json({ message: 'Purchase Report not found' });

    report.payments = report.payments.filter(
      (p) => p._id.toString() !== req.params.paymentId
    );

    const totalReceived = report.payments.reduce((s, p) => s + p.amount, 0);
    report.receivedAmount = totalReceived;

    if (totalReceived >= report.totalAmount) {
      report.paymentStatus = 'Payment Complete';
    } else if (totalReceived > 0) {
      report.paymentStatus = 'Advance Paid';
    } else {
      report.paymentStatus = 'Unpaid';
    }

    await report.save();
    res.json({ report });
  } catch (error) {
    console.error('Error deleting payment entry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
