const { toWords } = require('number-to-words');

function convertToWords(amount) {
  try {
    // Round to 2 decimal places to avoid floating point issues
    const roundedAmount = Math.round(amount * 100) / 100;
    
    // Split the amount into whole number and decimal parts
    const [wholeNumber, decimal] = roundedAmount.toFixed(2).split('.');
    
    // Convert the whole number to words with Indian numbering
    let words = toWords(parseInt(wholeNumber), { localeCode: 'en-IN' });
    
    // Capitalize the first letter
    words = words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
    
    // Handle decimal part
    const decimalValue = parseInt(decimal);
    if (decimalValue > 0) {
      const decimalWords = toWords(decimalValue, { localeCode: 'en-IN' });
      return `${words} Rupees and ${decimalWords} Paise only`;
    } else {
      return `${words} Rupees only`;
    }
  } catch (error) {
    console.error('Error converting number to words:', error);
    return 'Amount conversion error';
  }
}

module.exports = { convertToWords };