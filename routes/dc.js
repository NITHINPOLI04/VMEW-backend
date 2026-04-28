const express = require('express');
const DeliveryChallan = require('../models/DeliveryChallan');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { getFinancialYear } = require('../utils/financialYear');
const { dcBodySchema } = require('../validation/schemas');

const router = express.Router();

// GET /api/dc/:year
router.get('/:year', authenticate, async (req, res) => {
  try {
    const { year } = req.params;
    const dcs = await DeliveryChallan.find({ financialYear: year, userId: req.user.userId }).sort({ dcNumber: 1 });
    res.json(dcs);
  } catch (error) {
    console.error('Error fetching delivery challans:', error);
    res.status(500).json([]);
  }
});

// GET /api/dc/id/:id
router.get('/id/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const dc = await DeliveryChallan.findOne({ _id: id, userId: req.user.userId });
    if (!dc) return res.status(404).json({ message: 'DC not found' });
    res.json(dc);
  } catch (error) {
    console.error('Error fetching DC:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/dc
router.post('/', authenticate, validate(dcBodySchema), async (req, res) => {
  try {
    const d = req.body;
    const financialYear = getFinancialYear(d.date);

    const newDC = new DeliveryChallan({
      dcNumber: d.dcNumber,
      date: d.date,
      buyerName: d.buyerName,
      buyerAddress: d.buyerAddress,
      buyerGst: d.buyerGst,
      poNumber: d.poNumber,
      prqNumber: d.prqNumber,
      vehicleName: d.vehicleName,
      vehicleNumber: d.vehicleNumber,
      hslCodeNo: d.hslCodeNo,
      items: d.items,
      userId: req.user.userId,
      financialYear,
    });

    await newDC.save();
    res.status(201).json(newDC);
  } catch (error) {
    console.error('Error creating DC:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/dc/:id
router.put('/:id', authenticate, validate(dcBodySchema), async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    const financialYear = getFinancialYear(d.date);

    const updatedDC = await DeliveryChallan.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      {
        dcNumber: d.dcNumber,
        date: d.date,
        buyerName: d.buyerName,
        buyerAddress: d.buyerAddress,
        buyerGst: d.buyerGst,
        poNumber: d.poNumber,
        prqNumber: d.prqNumber,
        vehicleName: d.vehicleName,
        vehicleNumber: d.vehicleNumber,
        hslCodeNo: d.hslCodeNo,
        items: d.items,
        financialYear,
      },
      { new: true, runValidators: true }
    );

    if (!updatedDC) return res.status(404).json({ message: 'DC not found' });
    res.json(updatedDC);
  } catch (error) {
    console.error('Error updating DC:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/dc/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedDC = await DeliveryChallan.findOneAndDelete({ _id: id, userId: req.user.userId });
    if (!deletedDC) return res.status(404).json({ message: 'DC not found' });
    res.json({ message: 'DC deleted successfully' });
  } catch (error) {
    console.error('Error deleting DC:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
