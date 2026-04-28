/**
 * Returns the Indian financial year string for a given date.
 * e.g. April 2024 → "2024-2025", January 2024 → "2023-2024"
 *
 * @param {string | Date} dateInput
 * @returns {string}  e.g. "2024-2025"
 */
function getFinancialYear(dateInput) {
  const d = new Date(dateInput);
  const month = d.getMonth(); // 0-indexed
  const year = d.getFullYear();
  return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

module.exports = { getFinancialYear };
