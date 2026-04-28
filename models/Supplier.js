const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  address: { type: String },
  gstNo: { type: String }
}, { timestamps: true });

supplierSchema.index({ userId: 1 });

module.exports = mongoose.model('Supplier', supplierSchema);
