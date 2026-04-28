const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  poNumber: { type: String, required: true },
  date: { type: Date, required: true },
  supplierName: { type: String, required: true },
  supplierAddress: { type: String, required: true },
  supplierGst: { type: String },
  subject: { type: String },
  reference: { type: String },
  items: [{
    description: { type: String, required: true },
    hsnSacCode: { type: String },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    rate: { type: Number, required: true },
    taxableAmount: { type: Number, required: true },
    sgstPercentage: { type: Number },
    sgstAmount: { type: Number },
    cgstPercentage: { type: Number },
    cgstAmount: { type: Number },
    igstPercentage: { type: Number },
    igstAmount: { type: Number }
  }],
  taxType: { type: String, required: true },
  discountEnabled: { type: Boolean },
  discountPercentage: { type: Number },
  discountAmount: { type: Number },
  discountType: { type: String, default: 'percentage' },
  discountFixedAmount: { type: Number },
  subTotal: { type: Number },
  totalSgst: { type: Number },
  totalCgst: { type: Number },
  totalIgst: { type: Number },
  grandTotal: { type: Number, required: true },
  totalInWords: { type: String, required: true },
  notes: { type: String },
  financialYear: { type: String, required: true }
}, { timestamps: true });

purchaseOrderSchema.index({ userId: 1, financialYear: 1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
