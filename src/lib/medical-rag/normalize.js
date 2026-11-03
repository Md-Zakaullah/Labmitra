// Text normalisation for Hindi (Devanagari), English and Hinglish (Roman Hindi).
// Same function is used for user queries AND for library keywords, so spelling
// variants (bukhar / bukhaar / bukaar) end up as the same token.

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

/** Light clean-up only (used by safety rules): lowercase, NFC, no apostrophes, punctuation -> space. */
export function liteNormalize(input) {
  return String(input ?? "")
    .normalize("NFC")
    .replace(ZERO_WIDTH, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function foldDevanagari(s) {
  return s
    .normalize("NFD")
    .replace(/\u093C/g, "") // nukta: क़ -> क
    .replace(/\u0901/g, "\u0902") // chandrabindu -> anusvara: साँस == सांस
    .normalize("NFC");
}

function foldRoman(s) {
  return s
    .replace(/z/g, "j")
    .replace(/ph/g, "f")
    .replace(/aa+/g, "a")
    .replace(/ee+/g, "i")
    .replace(/ii+/g, "i")
    .replace(/oo+/g, "u")
    .replace(/uu+/g, "u")
    .replace(/([bcdfghjklmnpqrstvwxyz])\1+/g, "$1"); // double consonants -> single
}

/** Full normalisation used for retrieval. */
export function normalizeText(input) {
  const lite = liteNormalize(input);
  return foldRoman(foldDevanagari(lite)).replace(/\s+/g, " ").trim();
}

export function tokenize(input) {
  const n = normalizeText(input);
  return n ? n.split(" ") : [];
}

/** Levenshtein distance with early exit when above `max`. */
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Allowed typo distance by word length (short words must match exactly). */
export function maxTypos(word) {
  if (word.length >= 9) return 2;
  if (word.length >= 6) return 1;
  return 0;
}

/** All 1..maxN word n-grams of a token list. */
export function ngrams(tokens, maxN = 4) {
  const out = [];
  for (let n = 1; n <= maxN; n++) {
    for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

/** Strip control characters and cap length. Does not alter meaning. */
export function sanitizeUserInput(input, maxLen = 500) {
  return String(input ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(ZERO_WIDTH, "")
    .trim()
    .slice(0, maxLen);
}
