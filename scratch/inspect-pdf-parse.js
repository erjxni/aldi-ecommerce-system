const pdf = require('pdf-parse');
console.log(Object.keys(pdf));
if (pdf.PDFParse) {
  console.log('PDFParse properties:', Object.getOwnPropertyNames(pdf.PDFParse));
  console.log('PDFParse prototype properties:', Object.getOwnPropertyNames(pdf.PDFParse.prototype));
}
