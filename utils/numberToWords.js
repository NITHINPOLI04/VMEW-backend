function convertToWords(amount) {
  try {
    const roundedAmount = Math.round(amount * 100) / 100;
    const [wholeNumber, decimal] = roundedAmount.toFixed(2).split('.');

    const indianToWords = (num) => {
      const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
      const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
      const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
      const scales = ['', 'Thousand', 'Lakh', 'Crore'];

      if (num === 0) return 'Zero';

      // Convert to string and split into groups of 2 or 3 digits from right to left for Indian system
      const numStr = num.toString().padStart(Math.ceil(num.toString().length / 2) * 2, '0');
      const chunks = [];
      for (let i = numStr.length; i > 0; i -= 2) {
        const start = Math.max(0, i - 2);
        chunks.unshift(parseInt(numStr.substring(start, i), 10));
      }

      const words = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk === 0 && i === chunks.length - 1) continue; // Skip leading zero chunk
        if (chunk === 0) continue;
        let chunkWords = '';
        const hundred = Math.floor(chunk / 100);
        const remainder = chunk % 100;
        const ten = Math.floor(remainder / 10);
        const unit = remainder % 10;

        if (hundred > 0) chunkWords += `${units[hundred]} Hundred`;
        if (remainder > 0) {
          if (remainder > 0 && chunkWords) chunkWords += ' '; // Add space if hundred is present
          if (remainder < 10) chunkWords += units[unit];
          else if (remainder < 20) chunkWords += teens[remainder - 10];
          else {
            chunkWords += tens[ten];
            if (unit > 0) chunkWords += `-${units[unit]}`.replace('-', ' ');
          }
        }
        const scaleIndex = Math.floor((chunks.length - i - 1) / 2); // Adjust scale for Indian system (Lakh every 2 chunks)
        if (chunkWords && scaleIndex > 0) chunkWords += ` ${scales[scaleIndex]}`;
        words.push(chunkWords.trim());
      }

      return words.join(' ').trim();
    };

    let words = indianToWords(parseInt(wholeNumber));
    words = words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();

    const decimalValue = parseInt(decimal);
    if (decimalValue > 0) {
      const decimalWords = indianToWords(decimalValue);
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