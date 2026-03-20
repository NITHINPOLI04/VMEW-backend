const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const { convertToWords } = require('./utils/numberToWords.js');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Middleware
const corsOptions = {
  origin: ['https://vmew.onrender.com', 'http://localhost:5173', 'http://localhost:5174'], // Frontend origins
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], // Allow all relevant methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allow common headers
  credentials: true, // Enable credentials (e.g., cookies, auth headers)
  optionsSuccessStatus: 200, // Respond 200 to preflight requests
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan('dev'));

// Explicit OPTIONS handler for /api/auth/login to handle preflight requests
app.options('/api/auth/login', cors(corsOptions), (req, res) => {
  res.status(200).end();
});

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
  discountEnabled: { type: Boolean },
  discountPercentage: { type: Number },
  discountAmount: { type: Number },
  subTotal: { type: Number },
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
  status: { type: String, required: true, default: 'In Stock' },
  financialYear: { type: String, required: true },
}, { timestamps: true });

// Delivery Challan Schema
const deliveryChallanSchema = new mongoose.Schema({
  userId: { type: String, required: true },
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

// Quotation Schema
const quotationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
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
  subTotal: { type: Number },
  deliveryTerms: { type: String },
  paymentTerms: { type: String },
  guarantee: { type: String },
  validity: { type: String },
  grandTotal: { type: Number, required: true },
  totalInWords: { type: String },
  financialYear: { type: String, required: true }
}, { timestamps: true });

// Supplier Schema
const supplierSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  address: { type: String },
  gstNo: { type: String }
}, { timestamps: true });

// Customer Schema (for Invoice, DC, Quotation buyers)
const customerSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  address: { type: String },
  gstNo: { type: String },
  pan: { type: String },
  msme: { type: String }
}, { timestamps: true });

// Purchase Order Schema
const purchaseOrderSchema = new mongoose.Schema({
  userId: { type: String, required: true },
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
  subTotal: { type: Number },
  grandTotal: { type: Number, required: true },
  totalInWords: { type: String, required: true },
  notes: { type: String },
  financialYear: { type: String, required: true }
}, { timestamps: true });

// Models
const User = mongoose.model('User', userSchema);
const Invoice = mongoose.model('Invoice', invoiceSchema);
const Template = mongoose.model('Template', templateSchema);
const InventoryItem = mongoose.model('InventoryItem', inventorySchema);
const DeliveryChallan = mongoose.model('DeliveryChallan', deliveryChallanSchema);
const Quotation = mongoose.model('Quotation', quotationSchema);
const Supplier = mongoose.model('Supplier', supplierSchema);
const Customer = mongoose.model('Customer', customerSchema);
const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);

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

    const grandTotal = invoiceData.grandTotal || 0;
    const totalInWords = convertToWords(grandTotal);

    const newInvoice = new Invoice({
      ...invoiceData,
      userId: req.user.userId,
      financialYear,
      totalInWords
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

app.get('/api/dc/:year', authenticate, async (req, res) => {
  try {
    const { year } = req.params;
    const dcs = await DeliveryChallan.find({ financialYear: year, userId: req.user.userId }).sort({ dcNumber: 1 });
    res.json(dcs);
  } catch (error) {
    console.error('Error fetching delivery challans:', error.message, error.stack);
    res.status(500).json([]);
  }
});

app.get('/api/dc/id/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const dc = await DeliveryChallan.findOne({ _id: id, userId: req.user.userId });
    if (!dc) return res.status(404).json({ message: 'DC not found' });
    res.json(dc);
  } catch (error) {
    console.error('Error fetching DC:', error.message, error.stack);
    res.status(500).json({ message: 'Error fetching DC', error: error.message });
  }
});

app.post('/api/dc', authenticate, async (req, res) => {
  try {
    const dcData = req.body;
    const dcDate = new Date(dcData.date);
    const month = dcDate.getMonth();
    const year = dcDate.getFullYear();
    const financialYear = month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

    const newDC = new DeliveryChallan({
      ...dcData,
      userId: req.user.userId,
      financialYear
    });

    await newDC.save();
    res.status(201).json(newDC);
  } catch (error) {
    console.error('Error creating DC:', error.message, error.stack);
    res.status(500).json({ message: 'Error creating DC', error: error.message });
  }
});

app.put('/api/dc/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const dcData = req.body;
    const dcDate = new Date(dcData.date);
    const month = dcDate.getMonth();
    const year = dcDate.getFullYear();
    const financialYear = month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

    const updatedDC = await DeliveryChallan.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { ...dcData, financialYear },
      { new: true, runValidators: true }
    );

    if (!updatedDC) return res.status(404).json({ message: 'DC not found' });
    res.json(updatedDC);
  } catch (error) {
    console.error('Error updating DC:', error.message, error.stack);
    res.status(500).json({ message: 'Error updating DC', error: error.message });
  }
});

app.delete('/api/dc/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedDC = await DeliveryChallan.findOneAndDelete({ _id: id, userId: req.user.userId });
    if (!deletedDC) return res.status(404).json({ message: 'DC not found' });
    res.json({ message: 'DC deleted successfully' });
  } catch (error) {
    console.error('Error deleting DC:', error.message, error.stack);
    res.status(500).json({ message: 'Error deleting DC', error: error.message });
  }
});

app.get('/api/quotation/:year', authenticate, async (req, res) => {
  try {
    const { year } = req.params;
    const quotations = await Quotation.find({ financialYear: year, userId: req.user.userId }).sort({ quotationNumber: 1 });
    res.json(quotations);
  } catch (error) {
    console.error('Error fetching quotations:', error.message, error.stack);
    res.status(500).json([]);
  }
});

app.get('/api/quotation/id/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const quotation = await Quotation.findOne({ _id: id, userId: req.user.userId });
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
    res.json(quotation);
  } catch (error) {
    console.error('Error fetching quotation:', error.message, error.stack);
    res.status(500).json({ message: 'Error fetching quotation', error: error.message });
  }
});

app.post('/api/quotation', authenticate, async (req, res) => {
  try {
    const data = req.body;
    const docDate = new Date(data.date);
    const month = docDate.getMonth();
    const year = docDate.getFullYear();
    const financialYear = month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

    const newQuotation = new Quotation({
      ...data,
      userId: req.user.userId,
      financialYear
    });

    await newQuotation.save();
    res.status(201).json(newQuotation);
  } catch (error) {
    console.error('Error creating quotation:', error.message, error.stack);
    res.status(500).json({ message: 'Error creating quotation', error: error.message });
  }
});

app.put('/api/quotation/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const docDate = new Date(data.date);
    const month = docDate.getMonth();
    const year = docDate.getFullYear();
    const financialYear = month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

    const updatedQuotation = await Quotation.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { ...data, financialYear },
      { new: true, runValidators: true }
    );

    if (!updatedQuotation) return res.status(404).json({ message: 'Quotation not found' });
    res.json(updatedQuotation);
  } catch (error) {
    console.error('Error updating quotation:', error.message, error.stack);
    res.status(500).json({ message: 'Error updating quotation', error: error.message });
  }
});

app.delete('/api/quotation/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedQuotation = await Quotation.findOneAndDelete({ _id: id, userId: req.user.userId });
    if (!deletedQuotation) return res.status(404).json({ message: 'Quotation not found' });
    res.json({ message: 'Quotation deleted successfully' });
  } catch (error) {
    console.error('Error deleting quotation:', error.message, error.stack);
    res.status(500).json({ message: 'Error deleting quotation', error: error.message });
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

// Supplier Routes
app.get('/api/suppliers', authenticate, async (req, res) => {
  try {
    const suppliers = await Supplier.find({ userId: req.user.userId }).sort({ name: 1 });
    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error.message, error.stack);
    res.status(500).json([]);
  }
});

app.post('/api/suppliers', authenticate, async (req, res) => {
  try {
    const supplierData = req.body;
    const newSupplier = new Supplier({
      ...supplierData,
      userId: req.user.userId
    });
    await newSupplier.save();
    res.status(201).json(newSupplier);
  } catch (error) {
    console.error('Error creating supplier:', error.message, error.stack);
    res.status(500).json({ message: 'Error creating supplier', error: error.message });
  }
});

app.put('/api/suppliers/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const supplierData = req.body;
    
    const updatedSupplier = await Supplier.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { ...supplierData },
      { new: true, runValidators: true }
    );

    if (!updatedSupplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    res.json(updatedSupplier);
  } catch (error) {
    console.error('Error updating supplier:', error.message, error.stack);
    res.status(500).json({ message: 'Error updating supplier', error: error.message });
  }
});

app.delete('/api/suppliers/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSupplier = await Supplier.findOneAndDelete({ _id: id, userId: req.user.userId });
    
    if (!deletedSupplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier:', error.message, error.stack);
    res.status(500).json({ message: 'Error deleting supplier', error: error.message });
  }
});

// Customer Routes
app.get('/api/customers', authenticate, async (req, res) => {
  try {
    const customers = await Customer.find({ userId: req.user.userId }).sort({ name: 1 });
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error.message, error.stack);
    res.status(500).json([]);
  }
});

app.post('/api/customers', authenticate, async (req, res) => {
  try {
    const customerData = req.body;
    const newCustomer = new Customer({
      ...customerData,
      userId: req.user.userId
    });
    await newCustomer.save();
    res.status(201).json(newCustomer);
  } catch (error) {
    console.error('Error creating customer:', error.message, error.stack);
    res.status(500).json({ message: 'Error creating customer', error: error.message });
  }
});

app.put('/api/customers/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const customerData = req.body;
    
    const updatedCustomer = await Customer.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { ...customerData },
      { new: true, runValidators: true }
    );

    if (!updatedCustomer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json(updatedCustomer);
  } catch (error) {
    console.error('Error updating customer:', error.message, error.stack);
    res.status(500).json({ message: 'Error updating customer', error: error.message });
  }
});

app.delete('/api/customers/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedCustomer = await Customer.findOneAndDelete({ _id: id, userId: req.user.userId });
    
    if (!deletedCustomer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error.message, error.stack);
    res.status(500).json({ message: 'Error deleting customer', error: error.message });
  }
});

// PO Routes
app.get('/api/po/:year', authenticate, async (req, res) => {
  try {
    const { year } = req.params;
    const pos = await PurchaseOrder.find({ financialYear: year, userId: req.user.userId }).sort({ poNumber: 1 });
    res.json(pos);
  } catch (error) {
    console.error('Error fetching purchase orders:', error.message, error.stack);
    res.status(500).json([]);
  }
});

app.get('/api/po/id/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const po = await PurchaseOrder.findOne({ _id: id, userId: req.user.userId });
    if (!po) return res.status(404).json({ message: 'Purchase Order not found' });
    res.json(po);
  } catch (error) {
    console.error('Error fetching purchase order:', error.message, error.stack);
    res.status(500).json({ message: 'Error fetching purchase order', error: error.message });
  }
});

app.post('/api/po', authenticate, async (req, res) => {
  try {
    const poData = req.body;
    const poDate = new Date(poData.date);
    const month = poDate.getMonth();
    const year = poDate.getFullYear();
    const financialYear = month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

    const grandTotal = poData.grandTotal || 0;
    const totalInWords = convertToWords(grandTotal);

    const newPO = new PurchaseOrder({
      ...poData,
      userId: req.user.userId,
      financialYear,
      totalInWords
    });

    await newPO.save();
    res.status(201).json(newPO);
  } catch (error) {
    console.error('Error creating purchase order:', error.message, error.stack);
    res.status(500).json({ message: 'Error creating purchase order', error: error.message });
  }
});

app.put('/api/po/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const poData = req.body;
    const poDate = new Date(poData.date);
    const month = poDate.getMonth();
    const year = poDate.getFullYear();
    const financialYear = month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

    const updatedPO = await PurchaseOrder.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { ...poData, financialYear },
      { new: true, runValidators: true }
    );

    if (!updatedPO) return res.status(404).json({ message: 'Purchase Order not found' });
    res.json(updatedPO);
  } catch (error) {
    console.error('Error updating purchase order:', error.message, error.stack);
    res.status(500).json({ message: 'Error updating purchase order', error: error.message });
  }
});

app.delete('/api/po/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedPO = await PurchaseOrder.findOneAndDelete({ _id: id, userId: req.user.userId });
    if (!deletedPO) return res.status(404).json({ message: 'Purchase Order not found' });
    res.json({ message: 'Purchase Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase order:', error.message, error.stack);
    res.status(500).json({ message: 'Error deleting purchase order', error: error.message });
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

// Health-check route for uptime pings
app.get('/api/healthz', (req, res) => res.status(200).send('OK'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});