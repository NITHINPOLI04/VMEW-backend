const express = require('express');
const Supplier = require('../models/Supplier');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { supplierBodySchema } = require('../validation/schemas');

const router = express.Router();

// GET /api/suppliers
router.get('/', authenticate, async (req, res) => {
  try {
    const suppliers = await Supplier.find({ userId: req.user.userId }).sort({ name: 1 });
    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json([]);
  }
});

// POST /api/suppliers
router.post('/', authenticate, validate(supplierBodySchema), async (req, res) => {
  try {
    const d = req.body;
    const newSupplier = new Supplier({
      name: d.name,
      address: d.address,
      gstNo: d.gstNo,
      userId: req.user.userId,
    });
    await newSupplier.save();
    res.status(201).json(newSupplier);
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/suppliers/:id
router.put('/:id', authenticate, validate(supplierBodySchema), async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    const updatedSupplier = await Supplier.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { name: d.name, address: d.address, gstNo: d.gstNo },
      { new: true, runValidators: true }
    );
    if (!updatedSupplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    res.json(updatedSupplier);
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/suppliers/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSupplier = await Supplier.findOneAndDelete({ _id: id, userId: req.user.userId });
    if (!deletedSupplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
