/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CalcEngine (Server) — Server-side Financial Calculation Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Port of src/utils/calcEngine.ts for Node.js.
 * MUST remain algorithmically identical to the client-side version.
 *
 * Used by the validateFinancials middleware to recompute and verify
 * document totals before saving to the database.
 */

// ─── Rounding ─────────────────────────────────────────────────────────────────

function round2(value) {
  if (!Number.isFinite(value)) return 0;
  const factor = 100;
  const shifted = Math.round(value * factor + Number.EPSILON);
  return shifted / factor;
}

function roundGrandTotal(value) {
  if (!Number.isFinite(value)) return 0;
  const decimalPart = value % 1;
  if (decimalPart >= 0.50) return Math.ceil(value);
  return Math.floor(value);
}

// ─── Document-Level Calculations ──────────────────────────────────────────────

/**
 * Computes all document-level totals from items.
 * Algorithm is identical to the client-side computeDocumentTotals.
 *
 * @param {Array}   items             - Array of line items
 * @param {boolean} discountEnabled   - Whether discount is active
 * @param {number}  discountPercentage - Discount percentage (0-100)
 * @param {string}  taxType           - 'sgstcgst' or 'igst'
 * @param {string}  discountType      - 'percentage' or 'fixed'
 * @param {number}  discountFixedAmount - Fixed discount amount
 * @returns {Object} Computed totals
 */
function computeDocumentTotals(
  items,
  discountEnabled = false,
  discountPercentage = 0,
  taxType = 'sgstcgst',
  discountType = 'percentage',
  discountFixedAmount = 0
) {
  let subTotal = 0;
  let totalSgstRaw = 0;
  let totalCgstRaw = 0;
  let totalIgstRaw = 0;

  (items || []).forEach(item => {
    subTotal += (item.taxableAmount || 0);
    if (taxType === 'sgstcgst') {
      totalSgstRaw += (item.sgstAmount || 0);
      totalCgstRaw += (item.cgstAmount || 0);
    } else if (taxType === 'igst') {
      totalIgstRaw += (item.igstAmount || 0);
    }
  });

  subTotal = round2(subTotal);
  totalSgstRaw = round2(totalSgstRaw);
  totalCgstRaw = round2(totalCgstRaw);
  totalIgstRaw = round2(totalIgstRaw);

  let discountAmount = 0;
  if (discountEnabled) {
    if (discountType === 'percentage') {
      discountAmount = round2((subTotal * (discountPercentage || 0)) / 100);
    } else if (discountType === 'fixed') {
      discountAmount = round2(Math.min(discountFixedAmount || 0, subTotal));
    }
  }

  const totalTaxableValue = round2(subTotal - discountAmount);
  const ratio = subTotal > 0 ? totalTaxableValue / subTotal : 1;

  let totalSgst = 0;
  let totalCgst = 0;
  let totalIgst = 0;

  if (subTotal > 0) {
    if (taxType === 'sgstcgst') {
      totalSgst = round2(totalSgstRaw * ratio);
      totalCgst = round2(totalCgstRaw * ratio);
    } else if (taxType === 'igst') {
      totalIgst = round2(totalIgstRaw * ratio);
    }
  }

  const grandTotalRaw = round2(totalTaxableValue + totalSgst + totalCgst + totalIgst);
  const grandTotal = roundGrandTotal(grandTotalRaw);

  return {
    subTotal,
    discountAmount,
    totalTaxableValue,
    totalSgst,
    totalCgst,
    totalIgst,
    grandTotal,
    grandTotalRaw,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Hybrid mode thresholds */
const AUTO_CORRECT_THRESHOLD = 5.0;

/**
 * Validates the financial data in a document request body.
 * Hybrid mode:
 *   - Mismatch ≤ ₹5.00: auto-correct and proceed
 *   - Mismatch > ₹5.00: reject with 422
 *
 * @param {Object} body - Request body containing items, grandTotal, etc.
 * @returns {Object} { isValid, computedTotals, mismatchAmount, autoCorrections }
 */
function validateFinancials(body) {
  const {
    items,
    discountEnabled = false,
    discountPercentage = 0,
    taxType = 'sgstcgst',
    grandTotal: clientGrandTotal,
    discountType = 'percentage',
    discountFixedAmount = 0,
  } = body;

  const computed = computeDocumentTotals(
    items,
    discountEnabled,
    parseFloat(discountPercentage) || 0,
    taxType,
    discountType,
    parseFloat(discountFixedAmount) || 0
  );

  const mismatchAmount = round2(Math.abs((clientGrandTotal || 0) - computed.grandTotal));

  const autoCorrections = {};

  // Check sub-fields too
  if (body.subTotal !== undefined) {
    const subDiff = round2(Math.abs(body.subTotal - computed.subTotal));
    if (subDiff > 0.01) autoCorrections['subTotal'] = computed.subTotal;
  }
  if (body.discountAmount !== undefined) {
    const discDiff = round2(Math.abs(body.discountAmount - computed.discountAmount));
    if (discDiff > 0.01) autoCorrections['discountAmount'] = computed.discountAmount;
  }

  if (mismatchAmount > AUTO_CORRECT_THRESHOLD) {
    return {
      isValid: false,
      computedTotals: computed,
      mismatchAmount,
      autoCorrections: {},
      reason: `Grand total mismatch of ₹${mismatchAmount.toFixed(2)} exceeds the ₹${AUTO_CORRECT_THRESHOLD} threshold. Client sent ₹${(clientGrandTotal || 0).toFixed(2)}, server computed ₹${computed.grandTotal.toFixed(2)}.`,
    };
  }

  // Auto-correct: overwrite client values with server-computed values
  if (mismatchAmount > 0.01) {
    autoCorrections['grandTotal'] = computed.grandTotal;
  }

  return {
    isValid: true,
    computedTotals: computed,
    mismatchAmount,
    autoCorrections,
    reason: null,
  };
}

/**
 * Express middleware factory for financial validation.
 * Attaches computed data to req.computedFinancials for use in route handlers.
 */
function financialValidationMiddleware(req, res, next) {
  // Skip validation for documents without financial data (e.g., Delivery Challans)
  if (!req.body.items || !req.body.grandTotal) {
    return next();
  }

  const result = validateFinancials(req.body);

  if (!result.isValid) {
    console.error(`[FINANCIAL_VALIDATION] Rejected: ${result.reason}`);
    return res.status(422).json({
      message: 'Financial validation failed',
      reason: result.reason,
      computedGrandTotal: result.computedTotals.grandTotal,
      clientGrandTotal: req.body.grandTotal,
      mismatchAmount: result.mismatchAmount,
    });
  }

  // Apply auto-corrections to the request body
  if (Object.keys(result.autoCorrections).length > 0) {
    console.info(
      `[FINANCIAL_VALIDATION] Auto-corrected: ${JSON.stringify(result.autoCorrections)} (drift: ₹${result.mismatchAmount.toFixed(2)})`
    );
    Object.assign(req.body, result.autoCorrections);
  }

  // Attach for logging/audit
  req.computedFinancials = result.computedTotals;

  next();
}

module.exports = {
  round2,
  roundGrandTotal,
  computeDocumentTotals,
  validateFinancials,
  financialValidationMiddleware,
};
