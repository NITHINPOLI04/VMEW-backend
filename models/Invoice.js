const mongoose = require('mongoose');

// ─── Payment Entry sub-document ───────────────────────────────────────────────
const paymentEntrySchema = new mongoose.Schema({
  paymentDate:      { type: Date, required: true },
  grossAmount:      { type: Number, required: true, min: 0 },
  mode:             { type: String, enum: ['NEFT', 'RTGS', 'Cheque', 'Cash', 'UPI'], default: 'NEFT' },
  utrNumber:        { type: String, default: '' },
  notes:            { type: String, default: '' },

  // Permanent deductions — reduce revenue permanently
  ldRecovery:       { type: Number, default: 0 },
  itTds:            { type: Number, default: 0 },
  otherPermanent:   { type: Number, default: 0 },
  otherPermanentNote: { type: String, default: '' },

  // Recoverable deductions — keep invoice as Partially Paid until released
  gstTds:           { type: Number, default: 0 },
  gstRetention:     { type: Number, default: 0 },
  securityDeposit:  { type: Number, default: 0 },
  bankGuarantee:    { type: Number, default: 0 },
  otherRecoverable: { type: Number, default: 0 },
  otherRecoverableNote: { type: String, default: '' },

  // Pre-computed on save
  totalPermanentDeductions:   { type: Number, default: 0 },
  totalRecoverableDeductions: { type: Number, default: 0 },
  netAmount:        { type: Number, required: true },
}, { _id: true, timestamps: false });

// ─── Invoice document ─────────────────────────────────────────────────────────
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
    igstAmount: { type: Number },
    productKey: { type: String }
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
  financialYear: { type: String, required: true },
  invoiceType: { type: String, enum: ['Product', 'Service'], default: 'Product' },
  documentType: { type: String, enum: ['invoice', 'credit_note', 'debit_note'], default: 'invoice' },
  payments: { type: [paymentEntrySchema], default: [] },
  receivedAmount: { type: Number, default: 0 },
  linkedInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  linkedInvoiceNumber: { type: String, trim: true },
  reason: { type: String, trim: true }
}, { timestamps: true });

invoiceSchema.index({ userId: 1, financialYear: 1 });
invoiceSchema.index({ userId: 1, financialYear: 1, documentType: 1 });
invoiceSchema.index({ userId: 1, financialYear: 1, "items.productKey": 1 });
invoiceSchema.index({ userId: 1, financialYear: 1, invoiceNumber: 1, documentType: 1 }, { unique: true });
invoiceSchema.index({ userId: 1, financialYear: 1, date: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
