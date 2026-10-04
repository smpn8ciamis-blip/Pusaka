export const numberToWords = (num: number): string => {
  const ones = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  if (num < 12) return ones[num];
  if (num < 20) return ones[num - 10] + ' belas';
  if (num < 100) return ones[Math.floor(num / 10)] + ' puluh' + (num % 10 ? ' ' + ones[num % 10] : '');
  if (num < 200) return 'seratus' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
  if (num < 1000) return ones[Math.floor(num / 100)] + ' ratus' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
  if (num < 2000) return 'seribu' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
  if (num < 1000000) return numberToWords(Math.floor(num / 1000)) + ' ribu' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
  if (num < 1000000000) return numberToWords(Math.floor(num / 1000000)) + ' juta' + (num % 1000000 ? ' ' + numberToWords(num % 1000000) : '');
  return numberToWords(Math.floor(num / 1000000000)) + ' miliar' + (num % 1000000000 ? ' ' + numberToWords(num % 1000000000) : '');
};

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value);

export const capitalizeFirst = (str: string): string =>
  str.charAt(0).toUpperCase() + str.slice(1);
