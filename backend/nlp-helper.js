const afinn = {
  "good": 3, "great": 3, "excellent": 4, "happy": 3, "positive": 2, "love": 3,
  "bad": -3, "sad": -2, "terrible": -4, "loss": -3, "waste": -2, "fail": -2, "failure": -3,
  "worst": -4, "defect": -2, "broken": -2, "warning": -1, "danger": -3, "risk": -2,
  "awesome": 4, "perfect": 4, "best": 3, "benefit": 2, "gain": 2, "profit": 2, "success": 3,
  "successful": 3, "revenue": 1, "outstanding": 4, "compliance": 2, "comply": 2,
  "compliant": 2, "approved": 2, "pass": 2, "passed": 2, "secure": 2, "safe": 2,
  "certified": 2, "valid": 2, "invalid": -2, "expire": -2, "expired": -2,
  "error": -2, "hazard": -3, "unsafe": -3, "critical": -2, "violation": -3
};

const stopwords = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing",
  "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers",
  "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if",
  "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't",
  "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our",
  "ours", "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's",
  "should", "shouldn't", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs",
  "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
  "they've", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't",
  "we", "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's",
  "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", "won't",
  "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"
]);

function getTokens(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/[\s_]+/)
    .filter(t => t.trim() !== '');
}

/**
 * Performs sentiment analysis on text
 * Returns { score, label }
 */
function analyzeSentiment(text) {
  const tokens = getTokens(text);
  let score = 0;
  
  tokens.forEach(t => {
    if (afinn[t]) {
      score += afinn[t];
    }
  });

  let label = 'Neutral';
  if (score > 0) label = 'Positive';
  if (score < 0) label = 'Negative';

  return { score, label };
}

/**
 * Extracts key keywords from text (removes stopwords, length > 2)
 */
function extractKeywords(text) {
  const tokens = getTokens(text);
  const keywords = tokens.filter(t => t.length > 2 && !stopwords.has(t));
  return [...new Set(keywords)];
}

module.exports = {
  analyzeSentiment,
  extractKeywords
};
