function convertToWords(number) {
  // Basic implementation for number to words
  // For production, consider using 'number-to-words' library
  const units = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (number === 0) return units[0];
  if (number < 10) return units[number];
  if (number < 20) return teens[number - 10];
  if (number < 100) {
    const ten = Math.floor(number / 10);
    const unit = number % 10;
    return unit === 0 ? tens[ten] : `${tens[ten]} ${units[unit]}`;
  }
  if (number < 1000) {
    const hundred = Math.floor(number / 100);
    const remainder = number % 100;
    return remainder === 0 ? `${units[hundred]} Hundred` : `${units[hundred]} Hundred ${convertToWords(remainder)}`;
  }
  // Extend for larger numbers as needed
  return 'Number too large'; // Placeholder for numbers >= 1000
}

module.exports = { convertToWords };