const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { storage } = require('./db');

const cacheFilePath = path.join(__dirname, 'document-contents-cache.json');

// Helper to extract bucket path
const extractStoragePath = (url, bucketName) => {
  try {
    const decodedUrl = decodeURIComponent(url);
    const regex = new RegExp(`${bucketName}/(documents/[^?#]+)`);
    const match = decodedUrl.match(regex);
    if (match && match[1]) {
      return match[1];
    }
    const docIndex = decodedUrl.indexOf('/documents/');
    if (docIndex !== -1) {
      return decodedUrl.substring(docIndex + 1).split('?')[0];
    }
  } catch (e) {
    console.error('Failed to extract storage path:', e);
  }
  return null;
};

// Load cache from disk
function loadCache() {
  try {
    if (fs.existsSync(cacheFilePath)) {
      return JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to read document content cache:', err);
  }
  return {};
}

// Save cache to disk
function saveCache(cache) {
  try {
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write document content cache:', err);
  }
}

/**
 * Gets the extracted content of a document, utilizing local caching
 * so we only download and parse each document once.
 */
async function getDocumentContent(docId, fileUrl) {
  const cache = loadCache();
  
  if (cache[docId] !== undefined) {
    return cache[docId];
  }

  // If not cached, let's download and parse
  try {
    const bucket = storage.bucket();
    const filePath = extractStoragePath(fileUrl, bucket.name);
    if (!filePath) {
      console.warn(`[Content Cache] Could not parse path for: ${fileUrl}`);
      return '';
    }

    console.log(`[Content Cache] Downloading document from storage: ${filePath}...`);
    const storageFile = bucket.file(filePath);
    const [buffer] = await storageFile.download();

    let text = '';
    const extension = filePath.split('.').pop().toLowerCase();
    
    if (extension === 'pdf') {
      console.log(`[Content Cache] Parsing PDF content for document: ${docId}...`);
      const pdfData = await pdfParse(buffer);
      text = pdfData.text || '';
    } else if (extension === 'txt' || extension === 'csv' || extension === 'json') {
      text = buffer.toString('utf8');
    } else {
      console.warn(`[Content Cache] Unsupported document format for text extraction: .${extension}`);
      text = ''; // Fallback
    }

    // Save to cache
    cache[docId] = text;
    saveCache(cache);
    return text;
  } catch (err) {
    console.error(`[Content Cache] Error extracting content for document ${docId}:`, err);
    // Don't write to cache on error so we can retry later
    return '';
  }
}

module.exports = {
  getDocumentContent
};
