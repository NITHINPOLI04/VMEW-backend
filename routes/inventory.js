const express = require('express');
const InventoryItem = require('../models/InventoryItem');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { inventoryBodySchema } = require('../validation/schemas');

const router = express.Router();

// GET /api/inventory/:year
router.get('/:year', authenticate, async (req, res) => {
  try {
    const { year } = req.params;
    const inventory = await InventoryItem.find({ financialYear: year, userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json([]);
  }
});

// POST /api/inventory
router.post('/', authenticate, validate(inventoryBodySchema), async (req, res) => {
  try {
    const d = req.body;
    // Timestamps handled by Mongoose { timestamps: true } — do NOT pass them manually
    const newItem = new InventoryItem({
      description: d.description,
      hsnSacCode: d.hsnSacCode,
      quantity: d.quantity,
      unit: d.unit,
      rate: d.rate,
      transactionType: d.transactionType,
      status: d.status,
      financialYear: d.financialYear,
      userId: req.user.userId,
    });
    await newItem.save();
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating inventory item:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/inventory/:id
router.put('/:id', authenticate, validate(inventoryBodySchema), async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    const updatedItem = await InventoryItem.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      {
        description: d.description,
        hsnSacCode: d.hsnSacCode,
        quantity: d.quantity,
        unit: d.unit,
        rate: d.rate,
        transactionType: d.transactionType,
        status: d.status,
        financialYear: d.financialYear,
      },
      { new: true, runValidators: true }
    );
    if (!updatedItem) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }
    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedItem = await InventoryItem.findOneAndDelete({ _id: id, userId: req.user.userId });
    if (!deletedItem) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }
    res.json({ message: 'Inventory item deleted successfully' });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
