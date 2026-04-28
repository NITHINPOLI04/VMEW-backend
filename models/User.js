const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true },
  password: { type: String, required: true },
}, { timestamps: true });

userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
