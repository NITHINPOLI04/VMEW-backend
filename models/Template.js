const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true, enum: ['letterhead', 'defaultInfo'] },
  data: { type: Object, required: true }
}, { timestamps: true });

templateSchema.index({ userId: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Template', templateSchema);
