const express = require('express');
const mongoose = require('mongoose');
const InventoryItem = require('../models/InventoryItem');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { inventoryBodySchema } = require('../validation/schemas');
const { normalizeProductKey, computeStockStatus } = require('../utils/productUtils');

const router = express.Router();

// GET /api/inventory/products/suggestions
// Returns distinct products (latest per productKey) for auto-suggest dropdowns.
// IMPORTANT: This route MUST be defined before /:year to avoid path conflict.
router.get('/products/suggestions', authenticate, async (req, res) => {
  try {
    const { financialYear } = req.query;
    if (!financialYear) {
      return res.status(400).json({ message: 'financialYear is required' });
    }

    const suggestions = await InventoryItem.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(req.user.userId), 
          productKey: { $ne: '' }, 
          transactionType: 'Purchase',
          financialYear 
        } 
      },
      { $sort: { updatedAt: -1 } },
      {
        $group: {
          _id: '$productKey',
          description: { $first: '$description' },
          hsnSacCode: { $first: '$hsnSacCode' },
          rate: { $first: '$rate' },
          unit: { $first: '$unit' },
          currentStock: { $first: '$currentStock' },
          status: { $first: '$status' },
        },
      },
      { $sort: { description: 1 } },
    ]);

    res.json(
      suggestions.map((s) => ({
        productKey: s._id,
        description: s.description,
        hsnSacCode: s.hsnSacCode,
        rate: s.rate,
        unit: s.unit,
        currentStock: s.currentStock || 0,
        status: s.status || 'In Stock',
      }))
    );
  } catch (error) {
    console.error('Error fetching product suggestions:', error);
    res.status(500).json([]);
  }
});

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
    const productKey = normalizeProductKey(d.description);

    if (productKey) {
      // Find existing record for this product, transaction type, and FY
      const existingRecord = await InventoryItem.findOne({
        userId: req.user.userId,
        productKey,
        financialYear: d.financialYear,
        transactionType: d.transactionType,
        hsnSacCode: d.hsnSacCode || '',
        unit: d.unit || 'Nos',
        rate: d.rate
      });

      if (existingRecord) {
        // If it exists, update it instead of creating a new one
        const newQuantity = existingRecord.quantity + d.quantity;
        
        let updateData = { quantity: newQuantity, rate: d.rate };
        
        if (d.transactionType === 'Purchase') {
          const newStock = (existingRecord.currentStock || 0) + d.quantity;
          updateData.currentStock = newStock;
          updateData.status = computeStockStatus(newStock);
        }

        await InventoryItem.updateOne(
          { _id: existingRecord._id },
          { $set: updateData }
        );

        const updatedItem = await InventoryItem.findById(existingRecord._id);
        return res.status(200).json(updatedItem);
      }
    }

    // If it does not exist, create a new record
    let initialStock = d.transactionType === 'Purchase' ? d.quantity : 0;
    const status = d.transactionType === 'Purchase' ? computeStockStatus(initialStock) : d.status;

    const newItem = new InventoryItem({
      description: d.description,
      hsnSacCode: d.hsnSacCode,
      quantity: d.quantity,
      unit: d.unit,
      rate: d.rate,
      transactionType: d.transactionType,
      status,
      financialYear: d.financialYear,
      userId: req.user.userId,
      productKey,
      currentStock: initialStock,
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
    console.log("Updating inventory ID:", id);
    const d = req.body;
    const productKey = normalizeProductKey(d.description);
    const existingItem = await InventoryItem.findOne({ _id: id, userId: req.user.userId });
    if (!existingItem) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    // Calculate quantity difference
    const diff = d.quantity - existingItem.quantity;

    existingItem.description = d.description;
    existingItem.hsnSacCode = d.hsnSacCode;
    existingItem.quantity = d.quantity;
    existingItem.unit = d.unit;
    existingItem.rate = d.rate;
    existingItem.transactionType = d.transactionType;
    existingItem.financialYear = d.financialYear;
    existingItem.productKey = productKey;

    if (existingItem.transactionType === 'Purchase') {
      existingItem.currentStock = (existingItem.currentStock || 0) + diff;
      existingItem.status = computeStockStatus(existingItem.currentStock);
    } else {
      existingItem.status = d.status || 'In Stock';
    }

    const updatedItem = await existingItem.save();
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
