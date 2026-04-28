const express = require('express');
const Customer = require('../models/Customer');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { customerBodySchema } = require('../validation/schemas');

const router = express.Router();

// GET /api/customers
router.get('/', authenticate, async (req, res) => {
  try {
    const customers = await Customer.find({ userId: req.user.userId }).sort({ name: 1 });
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json([]);
  }
});

// POST /api/customers
router.post('/', authenticate, validate(customerBodySchema), async (req, res) => {
  try {
    const d = req.body;
    const newCustomer = new Customer({
      name: d.name,
      address: d.address,
      gstNo: d.gstNo,
      pan: d.pan,
      msme: d.msme,
      userId: req.user.userId,
    });
    await newCustomer.save();
    res.status(201).json(newCustomer);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/customers/:id
router.put('/:id', authenticate, validate(customerBodySchema), async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    const updatedCustomer = await Customer.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { name: d.name, address: d.address, gstNo: d.gstNo, pan: d.pan, msme: d.msme },
      { new: true, runValidators: true }
    );
    if (!updatedCustomer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json(updatedCustomer);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/customers/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedCustomer = await Customer.findOneAndDelete({ _id: id, userId: req.user.userId });
    if (!deletedCustomer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
