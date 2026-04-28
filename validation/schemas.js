/**
 * server/validation/schemas.js
 *
 * Zod schemas for every route's request body.
 * Mirrors the Mongoose model shapes but enforces them at the HTTP layer
 * before any DB interaction.
 */

const { z } = require('zod');

// ─── Shared sub-schemas ────────────────────────────────────────────────────────

const taxedItem = z.object({
  description:    z.string().min(1, 'Description is required'),
  hsnSacCode:     z.string().default(''),
  quantity:       z.number().positive('Quantity must be positive'),
  unit:           z.string().min(1, 'Unit is required'),
  rate:           z.number().min(0, 'Rate must be ≥ 0'),
  taxableAmount:  z.number().min(0).optional(),
  sgstPercentage: z.number().min(0).max(100).optional(),
  sgstAmount:     z.number().min(0).optional(),
  cgstPercentage: z.number().min(0).max(100).optional(),
  cgstAmount:     z.number().min(0).optional(),
  igstPercentage: z.number().min(0).max(100).optional(),
  igstAmount:     z.number().min(0).optional(),
});

const dcItem = z.object({
  description: z.string().min(1, 'Description is required'),
  hsnSacCode:  z.string().default(''),
  quantity:    z.number().positive('Quantity must be positive'),
  unit:        z.string().min(1, 'Unit is required'),
});

const discountFields = {
  discountEnabled:     z.boolean().optional(),
  discountPercentage:  z.number().min(0).max(100).optional(),
  discountAmount:      z.number().min(0).optional(),
  discountType:        z.enum(['percentage', 'fixed']).default('percentage'),
  discountFixedAmount: z.number().min(0).optional(),
};

const taxTotals = {
  subTotal:   z.number().min(0).optional(),
  totalSgst:  z.number().min(0).optional(),
  totalCgst:  z.number().min(0).optional(),
  totalIgst:  z.number().min(0).optional(),
};

// ─── Auth ──────────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signupSchema = z.object({
  email:    z.string().regex(EMAIL_REGEX, 'Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email:    z.string().regex(EMAIL_REGEX, 'Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// ─── Invoice ───────────────────────────────────────────────────────────────────

const invoiceBodySchema = z.object({
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  date:          z.string().min(1, 'Date is required'),
  buyerName:     z.string().min(1, 'Buyer name is required'),
  buyerAddress:  z.string().min(1, 'Buyer address is required'),
  buyerGst:      z.string().min(1, 'Buyer GST is required'),
  buyerPan:      z.string().optional(),
  buyerMsme:     z.string().optional(),
  vessel:        z.string().optional(),
  poNumber:      z.string().optional(),
  dcNumber:      z.string().optional(),
  ewayBillNo:    z.string().optional(),
  items:         z.array(taxedItem).min(1, 'At least one item is required'),
  taxType:       z.enum(['sgstcgst', 'igst']),
  ...discountFields,
  ...taxTotals,
  grandTotal:    z.number().min(0, 'Grand total must be ≥ 0'),
  totalInWords:  z.string().optional(),
  paymentStatus: z.enum(['Payment Complete', 'Partially Paid', 'Unpaid']).default('Unpaid'),
});

const paymentStatusSchema = z.object({
  status: z.enum(['Payment Complete', 'Partially Paid', 'Unpaid']),
});

// ─── Delivery Challan ─────────────────────────────────────────────────────────

const dcBodySchema = z.object({
  dcNumber:      z.string().min(1, 'DC number is required'),
  date:          z.string().min(1, 'Date is required'),
  buyerName:     z.string().min(1, 'Buyer name is required'),
  buyerAddress:  z.string().min(1, 'Buyer address is required'),
  buyerGst:      z.string().optional(),
  poNumber:      z.string().min(1, 'PO number is required'),
  prqNumber:     z.string().optional(),
  vehicleName:   z.string().min(1, 'Vehicle name is required'),
  vehicleNumber: z.string().min(1, 'Vehicle number is required'),
  hslCodeNo:     z.string().optional(),
  items:         z.array(dcItem).min(1, 'At least one item is required'),
});

// ─── Quotation ─────────────────────────────────────────────────────────────────

const quotationBodySchema = z.object({
  quotationNumber: z.string().min(1, 'Quotation number is required'),
  date:            z.string().min(1, 'Date is required'),
  buyerName:       z.string().min(1, 'Buyer name is required'),
  buyerAddress:    z.string().min(1, 'Buyer address is required'),
  buyerGst:        z.string().optional(),
  refNumber:       z.string().optional(),
  enqNumber:       z.string().optional(),
  items:           z.array(taxedItem).min(1, 'At least one item is required'),
  taxType:         z.enum(['sgstcgst', 'igst']).optional(),
  ...discountFields,
  ...taxTotals,
  deliveryTerms:   z.string().optional(),
  paymentTerms:    z.string().optional(),
  guarantee:       z.string().optional(),
  validity:        z.string().optional(),
  grandTotal:      z.number().min(0),
  totalInWords:    z.string().optional(),
});

// ─── Template ─────────────────────────────────────────────────────────────────

const letterheadSchema = z.object({
  companyName: z.string().min(1),
  gstNo:       z.string().min(1),
  address:     z.string().min(1),
  workshop:    z.string().optional().default(''),
  email:       z.string().optional().default(''),
  cell:        z.string().optional().default(''),
});

const defaultInfoSchema = z.object({
  bankName:   z.string().min(1),
  accountNo:  z.string().min(1),
  ifscCode:   z.string().min(1),
  branch:     z.string().optional().default(''),
  panNo:      z.string().optional().default(''),
  msmeNo:     z.string().optional().default(''),
  terms:      z.array(z.string()).optional().default([]),
});

// Use a discriminated union based on the :type param — validated in route handler
const templateBodySchema = z.union([letterheadSchema, defaultInfoSchema]);

// ─── Inventory ────────────────────────────────────────────────────────────────

const inventoryBodySchema = z.object({
  description:     z.string().min(1, 'Description is required'),
  hsnSacCode:      z.string().min(1, 'HSN/SAC code is required'),
  quantity:        z.number().min(0, 'Quantity must be ≥ 0'),
  unit:            z.enum(['Nos', 'Mts', 'Lts', 'Pkt', 'Kgs']),
  rate:            z.number().min(0, 'Rate must be ≥ 0'),
  transactionType: z.enum(['Sales', 'Purchase']),
  status:          z.string().default('In Stock'),
  financialYear:   z.string().min(1, 'Financial year is required'),
});

// ─── Supplier ─────────────────────────────────────────────────────────────────

const supplierBodySchema = z.object({
  name:    z.string().min(1, 'Supplier name is required'),
  address: z.string().optional().default(''),
  gstNo:   z.string().optional().default(''),
});

// ─── Customer ─────────────────────────────────────────────────────────────────

const customerBodySchema = z.object({
  name:    z.string().min(1, 'Customer name is required'),
  address: z.string().optional().default(''),
  gstNo:   z.string().optional().default(''),
  pan:     z.string().optional().default(''),
  msme:    z.string().optional().default(''),
});

// ─── Purchase Order ───────────────────────────────────────────────────────────

const poBodySchema = z.object({
  poNumber:        z.string().min(1, 'PO number is required'),
  date:            z.string().min(1, 'Date is required'),
  supplierName:    z.string().min(1, 'Supplier name is required'),
  supplierAddress: z.string().min(1, 'Supplier address is required'),
  supplierGst:     z.string().optional(),
  subject:         z.string().optional(),
  reference:       z.string().optional(),
  items:           z.array(taxedItem).min(1, 'At least one item is required'),
  taxType:         z.enum(['sgstcgst', 'igst']),
  ...discountFields,
  ...taxTotals,
  grandTotal:      z.number().min(0),
  totalInWords:    z.string().optional(),
  notes:           z.string().optional(),
});

module.exports = {
  signupSchema,
  loginSchema,
  invoiceBodySchema,
  paymentStatusSchema,
  dcBodySchema,
  quotationBodySchema,
  templateBodySchema,
  letterheadSchema,
  defaultInfoSchema,
  inventoryBodySchema,
  supplierBodySchema,
  customerBodySchema,
  poBodySchema,
};
