const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invoiceNumber: { type: String, required: true },
  date: { type: Date, required: true },
  buyerName: { type: String, required: true },
  buyerAddress: { type: String, required: true },
  buyerGst: { type: String, required: true },
  buyerPan: { type: String },
  buyerMsme: { type: String },
  vessel: { type: String },
  poNumber: { type: String },
  dcNumber: { type: String },
  ewayBillNo: { type: String },
  items: [{
    description: { type: String, required: true },
    hsnSacCode: { type: String, required: true },
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
  paymentStatus: {
    type: String,
    required: true,
    enum: ['Payment Complete', 'Partially Paid', 'Unpaid'],
    default: 'Unpaid'
  },
  financialYear: { type: String, required: true }
}, { timestamps: true });

invoiceSchema.index({ userId: 1, financialYear: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
