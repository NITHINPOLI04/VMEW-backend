/**
 * server/index.js — Application Bootstrap
 *
 * Responsibilities:
 *  - Load environment variables
 *  - Validate required env vars (fail fast)
 *  - Configure Express middleware (CORS, JSON, logging, rate limiting)
 *  - Connect to MongoDB
 *  - Mount all route modules
 *  - Start the HTTP server
 *
 * Route logic    → server/routes/
 * Models/schemas → server/models/
 * Auth guard     → server/middleware/authenticate.js
 * Utilities      → server/utils/
 */

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

// ─── Fail fast on missing critical env vars ────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI environment variable is not set. Refusing to start.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// ─── CORS ──────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: ['https://vmew.onrender.com', 'http://localhost:5173', 'http://localhost:5174'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// ─── Body parsing & logging ────────────────────────────────────────────────────
app.use(express.json());
app.use(morgan('dev'));

// ─── Rate limiting (auth routes only) ─────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});
app.use('/api/auth', authLimiter);

// ─── MongoDB connection ────────────────────────────────────────────────────────
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

// ─── Route modules ─────────────────────────────────────────────────────────────
const authRoutes       = require('./routes/auth');
const invoiceRoutes    = require('./routes/invoices');
const dcRoutes         = require('./routes/dc');
const quotationRoutes  = require('./routes/quotations');
const templateRoutes   = require('./routes/templates');
const inventoryRoutes  = require('./routes/inventory');
const supplierRoutes   = require('./routes/suppliers');
const customerRoutes   = require('./routes/customers');
const poRoutes         = require('./routes/po');

app.use('/api/auth',      authRoutes);
app.use('/api/invoices',  invoiceRoutes);
app.use('/api/dc',        dcRoutes);
app.use('/api/quotation', quotationRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/po',        poRoutes);

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/api/healthz', (req, res) => res.status(200).send('OK'));

// ─── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});