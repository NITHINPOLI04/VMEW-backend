const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true },
  hsnSacCode: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  rate: { type: Number, required: true },
  transactionType: { type: String, required: true, enum: ['Sales', 'Purchase'] },
  status: { type: String, required: true, default: 'In Stock' },
  financialYear: { type: String, required: true },
  productKey: { type: String, default: '' },
  currentStock: { type: Number, default: 0 },
}, { timestamps: true });

inventorySchema.index({ userId: 1, financialYear: 1 });
inventorySchema.index({ userId: 1, productKey: 1 });

module.exports = mongoose.model('InventoryItem', inventorySchema);
