const mongoose = require('mongoose');

const deliveryChallanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dcNumber: { type: String, required: true },
  date: { type: Date, required: true },
  buyerName: { type: String, required: true },
  buyerAddress: { type: String, required: true },
  buyerGst: { type: String },
  poNumber: { type: String, required: true },
  prqNumber: { type: String },
  vehicleName: { type: String, required: true },
  vehicleNumber: { type: String, required: true },
  hslCodeNo: { type: String },
  items: [{
    description: { type: String, required: true },
    hsnSacCode: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true }
  }],
  financialYear: { type: String, required: true }
}, { timestamps: true });

deliveryChallanSchema.index({ userId: 1, financialYear: 1 });

module.exports = mongoose.model('DeliveryChallan', deliveryChallanSchema);
