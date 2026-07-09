const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const path = require('path');

async function run() {
  const mockPath = path.join(__dirname, '../tests/database-tests/mock-document.pdf');
  if (!fs.existsSync(mockPath)) {
    fs.writeFileSync(mockPath, 'PDF mock content');
  }

  const buffer = fs.readFileSync(mockPath);
  console.log('Buffer length:', buffer.length);

  try {
    const parser = new PDFParse({ data: buffer });
    console.log('Loading buffer...');
    await parser.load();
    console.log('Extracting text...');
    const text = await parser.getText();
    console.log('Extracted text:', text);
    parser.destroy();
  } catch (err) {
    console.error('Failed to parse:', err);
  }
}

run().then(() => process.exit(0));
