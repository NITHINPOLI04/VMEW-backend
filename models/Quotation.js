const mongoose = require('mongoose');

const quotationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  quotationNumber: { type: String, required: true },
  date: { type: Date, required: true },
  buyerName: { type: String, required: true },
  buyerAddress: { type: String, required: true },
  buyerGst: { type: String },
  refNumber: { type: String },
  enqNumber: { type: String },
  items: [{
    description: { type: String, required: true },
    hsnSacCode: { type: String },
    quantity: { type: Number, required: true },
    unit: { type: String },
    rate: { type: Number, required: true },
    taxableAmount: { type: Number },
    sgstPercentage: { type: Number },
    sgstAmount: { type: Number },
    cgstPercentage: { type: Number },
    cgstAmount: { type: Number },
    igstPercentage: { type: Number },
    igstAmount: { type: Number }
  }],
  taxType: { type: String },
  discountEnabled: { type: Boolean },
  discountPercentage: { type: Number },
  discountAmount: { type: Number },
  discountType: { type: String, default: 'percentage' },
  discountFixedAmount: { type: Number },
  subTotal: { type: Number },
  totalSgst: { type: Number },
  totalCgst: { type: Number },
  totalIgst: { type: Number },
  deliveryTerms: { type: String },
  paymentTerms: { type: String },
  guarantee: { type: String },
  validity: { type: String },
  grandTotal: { type: Number, required: true },
  totalInWords: { type: String },
  financialYear: { type: String, required: true }
}, { timestamps: true });

quotationSchema.index({ userId: 1, financialYear: 1 });

module.exports = mongoose.model('Quotation', quotationSchema);
