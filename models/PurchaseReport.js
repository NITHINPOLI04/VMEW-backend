const mongoose = require('mongoose');

// ─── Payment Entry sub-document for Purchase Reports ──────────────────────────
const purchasePaymentEntrySchema = new mongoose.Schema({
  paymentDate:     { type: Date, required: true },
  amount:          { type: Number, required: true, min: 0 },
  mode:            { type: String, enum: ['NEFT', 'RTGS', 'Cheque', 'Cash', 'UPI'], default: 'NEFT' },
  referenceNumber: { type: String, default: '' },
  notes:           { type: String, default: '' },
}, { _id: true, timestamps: false });

// ─── Purchase Report document ─────────────────────────────────────────────────
const purchaseReportSchema = new mongoose.Schema({
  userId:             { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  partyInvoiceNumber: { type: String, required: true },
  date:               { type: Date, required: true },
  partyName:          { type: String, required: true },
  partyAddress:       { type: String, default: '' },
  partyGst:           { type: String, default: '' },
  taxType:            { type: String, enum: ['sgstcgst', 'igst'], required: true },
  taxableValue:       { type: Number, required: true, min: 0 },
  sgstPercentage:     { type: Number, default: 9 },
  cgstPercentage:     { type: Number, default: 9 },
  igstPercentage:     { type: Number, default: 18 },
  igstAmount:         { type: Number, default: 0 },
  cgstAmount:         { type: Number, default: 0 },
  sgstAmount:         { type: Number, default: 0 },
  totalAmount:        { type: Number, required: true, min: 0 },
  paymentStatus: {
    type: String,
    enum: ['Payment Complete', 'Advance Paid', 'Unpaid'],
    default: 'Unpaid',
  },
  payments:        { type: [purchasePaymentEntrySchema], default: [] },
  receivedAmount:  { type: Number, default: 0 },
  gstFiled:        { type: Boolean, default: false },
  gstFiledDate:    { type: Date, default: null },
  notes:           { type: String, default: '' },
  financialYear:   { type: String, required: true },
}, { timestamps: true });

purchaseReportSchema.index({ userId: 1, financialYear: 1 });
purchaseReportSchema.index({ userId: 1, financialYear: 1, partyInvoiceNumber: 1 });

module.exports = mongoose.model('PurchaseReport', purchaseReportSchema);
