const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  address: { type: String },
  gstNo: { type: String },
  pan: { type: String },
  msme: { type: String }
}, { timestamps: true });

customerSchema.index({ userId: 1 });

module.exports = mongoose.model('Customer', customerSchema);
