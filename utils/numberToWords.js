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

      const chunks = [];
      while (num > 0) {
        chunks.unshift(num % 1000);
        num = Math.floor(num / 1000);
      }

      const words = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk === 0 && i === chunks.length - 1) continue;
        if (chunk === 0) continue;
        let chunkWords = '';
        const hundred = Math.floor(chunk / 100);
        const remainder = chunk % 100;
        const ten = Math.floor(remainder / 10);
        const unit = remainder % 10;

        if (hundred > 0) chunkWords += `${units[hundred]} Hundred `;
        if (remainder > 0) {
          if (remainder < 10) chunkWords += ` ${units[remainder]}`;
          else if (remainder < 20) chunkWords += ` ${teens[remainder - 10]}`;
          else {
            chunkWords += ` ${tens[ten]}`;
            if (unit > 0) chunkWords += `-${units[unit]}`.replace('-', ' ');
          }
        }
        if (chunkWords.trim() && i > 0) chunkWords += ` ${scales[chunks.length - i - 1]}`;
        words.push(chunkWords.trim());
      }

      return words.reverse().join(' ').trim();
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