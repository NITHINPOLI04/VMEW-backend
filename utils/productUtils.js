/**
 * server/utils/productUtils.js
 *
 * Utility functions for product identification and stock management.
 */

const LOW_STOCK_THRESHOLD = 10;

/**
 * Normalize a product description into a unique key.
 * "LED Flood Light" → "led_flood_light"
 */
function normalizeProductKey(description) {
  return (description || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._]/g, '');
}

/**
 * Derive stock status from the current stock quantity.
 */
function computeStockStatus(currentStock) {
  if (currentStock <= 0) return 'Out of Stock';
  if (currentStock < LOW_STOCK_THRESHOLD) return 'Low Stock';
  return 'In Stock';
}

module.exports = { normalizeProductKey, computeStockStatus, LOW_STOCK_THRESHOLD };
