const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cors = require('cors');
const { convertToWords } = require('./utils/numberToWords.js');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Middleware
app.use(cors({ origin: 'https://vmew.onrender.com' })); // Update to frontend URL in production
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
}, { timestamps: true });

// Invoice Schema
const invoiceSchema = new mongoose.Schema({
  userId: { type: String, required: true },
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

// Template Schema
const templateSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  type: { type: String, required: true, enum: ['letterhead', 'defaultInfo'] },
  data: { type: Object, required: true }
}, { timestamps: true });

// Inventory Schema
const inventorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  description: { type: String, required: true },
  hsnSacCode: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  rate: { type: Number, required: true },
  transactionType: { type: String, required: true, enum: ['Sales', 'Purchase'] },
  financialYear: { type: String, required: true },
  partyGstNo: { type: String, required: true },
  partyName: { type: String, required: true },
  basicAmt: { type: Number, required: true },
  igst: { type: Number, required: true },
  cgst: { type: Number, required: true },
  sgst: { type: Number, required: true },
  total: { type: Number, required: true },
  transport: { type: Number, required: true },
  gstPercentage: { type: Number, required: true },
  paymentDetails: { type: String, required: true },
  paymentDate: { type: String, required: true },
  taxType: { type: String, required: true, enum: ['sgstcgst', 'igst'] }
}, { timestamps: true });

// Models
const User = mongoose.model('User', userSchema);
const Invoice = mongoose.model('Invoice', invoiceSchema);
const Template = mongoose.model('Template', templateSchema);
const InventoryItem = mongoose.model('InventoryItem', inventorySchema);

// Authentication Middleware
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Authentication Routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1d' });
    res.status(201).json({ token, userId: user._id, email });
  } catch (error) {
    console.error('Error signing up:', error.message, error.stack);
    res.status(500).json({ message: 'Error signing up', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, userId: user._id, email });
  } catch (error) {
    console.error('Error logging in:', error.message, error.stack);
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
});

// API Routes
app.get('/api/invoices/:year', authenticate, async (req, res) => {
  try {
    const { year } = req.params;
    const invoices = await Invoice.find({ financialYear: year, userId: req.user.userId }).sort({ invoiceNumber: 1 });
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error.message, error.stack);
    res.status(500).json([]);
  }
});

app.get('/api/invoices/id/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await Invoice.findOne({ _id: id, userId: req.user.userId });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error.message, error.stack);
    res.status(500).json({ message: 'Error fetching invoice', error: error.message });
  }
});

app.post('/api/invoices', authenticate, async (req, res) => {
  try {
    const invoiceData = req.body;
    const invoiceDate = new Date(invoiceData.date);
    const month = invoiceDate.getMonth();
    const year = invoiceDate.getFullYear();
    const financialYear = month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    
    const newInvoice = new Invoice({
      ...invoiceData,
      userId: req.user.userId,
      financialYear
    });
    
    await newInvoice.save();
    res.status(201).json(newInvoice);
  } catch (error) {
    console.error('Error creating invoice:', error.message, error.stack);
    res.status(500).json({ message: 'Error creating invoice', error: error.message });
  }
});

app.put('/api/invoices/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const invoiceData = req.body;
    const invoiceDate = new Date(invoiceData.date);
    const month = invoiceDate.getMonth();
    const year = invoiceDate.getFullYear();
    const financialYear = month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    
    const updatedInvoice = await Invoice.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { ...invoiceData, financialYear },
      { new: true, runValidators: true }
    );
    
    if (!updatedInvoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    res.json(updatedInvoice);
  } catch (error) {
    console.error('Error updating invoice:', error.message, error.stack);
    res.status(500).json({ message: 'Error updating invoice', error: error.message });
  }
});

app.patch('/api/invoices/:id/payment-status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['Payment Complete', 'Partially Paid', 'Unpaid'].includes(status)) {
      return res.status(400).json({ message: 'Invalid payment status' });
    }
    
    const updatedInvoice = await Invoice.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { paymentStatus: status },
      { new: true }
    );
    
    if (!updatedInvoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    res.json(updatedInvoice);
  } catch (error) {
    console.error('Error updating payment status:', error.message, error.stack);
    res.status(500).json({ message: 'Error updating payment status', error: error.message });
  }
});

app.delete('/api/invoices/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedInvoice = await Invoice.findOneAndDelete({ _id: id, userId: req.user.userId });
    
    if (!deletedInvoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting invoice:', error.message, error.stack);
    res.status(500).json({ message: 'Error deleting invoice', error: error.message });
  }
});

app.get('/api/templates/:type', authenticate, async (req, res) => {
  try {
    const { type } = req.params;
    if (!['letterhead', 'defaultInfo'].includes(type)) {
      return res.status(400).json({ message: 'Invalid template type' });
    }
    const template = await Template.findOne({ type, userId: req.user.userId });
    res.json(template ? template.data : null);
  } catch (error) {
    console.error('Error fetching template:', error.message, error.stack);
    res.status(500).json({ message: 'Error fetching template', error: error.message });
  }
});

app.put('/api/templates/:type', authenticate, async (req, res) => {
  try {
    const { type } = req.params;
    const data = req.body;
    if (!['letterhead', 'defaultInfo'].includes(type)) {
      return res.status(400).json({ message: 'Invalid template type' });
    }
    const updatedTemplate = await Template.findOneAndUpdate(
      { type, userId: req.user.userId },
      { type, data, userId: req.user.userId },
      { upsert: true, new: true, runValidators: true }
    );
    res.json(updatedTemplate.data);
  } catch (error) {
    console.error('Error updating template:', error.message, error.stack);
    res.status(500).json({ message: 'Error updating template', error: error.message });
  }
});

app.get('/api/inventory/:year', authenticate, async (req, res) => {
  try {
    const { year } = req.params;
    const inventory = await InventoryItem.find({ financialYear: year, userId: req.user.userId });
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching inventory:', error.message, error.stack);
    res.status(500).json([]);
  }
});

app.post('/api/inventory', authenticate, async (req, res) => {
  try {
    const itemData = req.body;
    const newItem = new InventoryItem({
      ...itemData,
      userId: req.user.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await newItem.save();
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating inventory item:', error.message, error.stack);
    res.status(500).json({ message: 'Error creating inventory item', error: error.message });
  }
});

app.put('/api/inventory/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const itemData = req.body;
    const updatedItem = await InventoryItem.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { ...itemData, updatedAt: new Date().toISOString() },
      { new: true, runValidators: true }
    );
    if (!updatedItem) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }
    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating inventory item:', error.message, error.stack);
    res.status(500).json({ message: 'Error updating inventory item', error: error.message });
  }
});

app.delete('/api/inventory/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedItem = await InventoryItem.findOneAndDelete({ _id: id, userId: req.user.userId });
    if (!deletedItem) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }
    res.json({ message: 'Inventory item deleted successfully' });
  } catch (error) {
    console.error('Error deleting inventory item:', error.message, error.stack);
    res.status(500).json({ message: 'Error deleting inventory item', error: error.message });
  }
});

app.post('/api/utils/number-to-words', (req, res) => {
  try {
    const { number } = req.body;
    const words = convertToWords(number);
    res.json({ words });
  } catch (error) {
    console.error('Error converting number to words:', error.message, error.stack);
    res.status(500).json({ message: 'Error converting number to words', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});