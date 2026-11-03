// Weighted keyword retrieval. Independent of any AI provider.
//
// How it works
//  1. Every keyword/phrase (record names, hi/en/hinglish keywords, user query n-grams)
//     is normalised, then mapped to a "feature key". Phrases listed together in
//     symptom-synonyms.json share ONE key (this is the symptom de-duplication).
//  2. A record's score = sum of weights of the feature keys it shares with the query.
//     Weight = IDF (rare/specific terms count more than terms shared by many records),
//     doubled for the condition's own name. Generic symptoms (fatigue, fever...) therefore
//     never decide a result on their own.
//  3. Misspelled single words are corrected against the library vocabulary.
//  4. A keyword match is only "relevance", never a diagnosis.

import { normalizeText, tokenize, ngrams, editDistance, maxTypos } from "./normalize.js";

export const DEFAULT_CONFIG = {
  minScore: Number(process.env.MEDICAL_MIN_SCORE ?? 2.0), // below this => no reliable match
  ambiguityRatio: Number(process.env.MEDICAL_AMBIGUITY_RATIO ?? 1.4), // top must beat 2nd by this factor
  maxResults: 3,
  nameBoost: 2,
};

function buildSynonymMap(synonymGroups) {
  const map = new Map(); // normalised phrase -> feature key
  for (const [key, phrases] of Object.entries(synonymGroups || {})) {
    if (key.startsWith("_")) continue;
    for (const p of phrases) map.set(normalizeText(p), `sym:${key}`);
  }
  return map;
}

function recordTerms(rec) {
  const k = rec.keywords || {};
  const names = [rec.name_en, rec.name_hi, ...(rec.name_aliases || [])].filter(Boolean);
  const symptoms = [...(k.en || []), ...(k.hi || []), ...(k.hinglish || [])];
  return { names, symptoms };
}

/**
 * Build an in-memory index.
 * @param {Array} records  items with id, name_en, name_hi, keywords{hi,en,hinglish}
 * @param {Object} synonymGroups  { key: [phrases...] }
 */
export function buildIndex(records, synonymGroups = {}) {
  const synonyms = buildSynonymMap(synonymGroups);
  const keyOf = (phrase) => {
    const n = normalizeText(phrase);
    return synonyms.get(n) || n;
  };

  const docs = records.map((rec) => {
    const { names, symptoms } = recordTerms(rec);
    const nameKeys = new Set(names.map(keyOf).filter(Boolean));
    const symptomKeys = new Set(symptoms.map(keyOf).filter(Boolean));
    return { id: rec.id, rec, nameKeys, symptomKeys };
  });

  // document frequency per feature key
  const df = new Map();
  for (const d of docs) {
    for (const k of new Set([...d.nameKeys, ...d.symptomKeys])) df.set(k, (df.get(k) || 0) + 1);
  }

  // vocabulary of single words for typo correction.
  // word -> signature of what it points to (doc ids or a symptom group), so that two
  // different spellings of the SAME thing do not count as an ambiguous correction.
  const vocabSets = new Map();
  const addVocab = (word, target) => {
    if (!word || word.includes(" ")) return;
    if (!vocabSets.has(word)) vocabSets.set(word, new Set());
    vocabSets.get(word).add(target);
  };
  for (const d of docs) {
    for (const k of [...d.nameKeys, ...d.symptomKeys]) if (!k.startsWith("sym:")) addVocab(k, d.id);
  }
  for (const [phrase, key] of synonyms) addVocab(phrase, key);
  const vocab = new Map([...vocabSets].map(([w, set]) => [w, [...set].sort().join("|")]));

  return { docs, df, vocab, synonyms, keyOf, N: Math.max(docs.length, 1) };
}

function correctToken(token, vocab) {
  if (vocab.has(token)) return token;
  const allowed = maxTypos(token);
  if (!allowed) return token;
  let bestDist = allowed + 1;
  let candidates = [];
  for (const [w, signature] of vocab) {
    if (w[0] !== token[0] || Math.abs(w.length - token.length) > allowed) continue;
    const d = editDistance(token, w, allowed);
    if (d > allowed) continue;
    if (d < bestDist) { bestDist = d; candidates = [{ w, signature }]; }
    else if (d === bestDist) candidates.push({ w, signature });
  }
  if (!candidates.length) return token;
  // accept only when every equally-close candidate points to the same thing
  return candidates.every((c) => c.signature === candidates[0].signature) ? candidates[0].w : token;
}

/** Feature keys found in the user's query. */
export function extractQueryKeys(query, index) {
  const tokens = tokenize(query);
  const corrected = tokens.map((t) => correctToken(t, index.vocab));
  const phrases = new Set([...ngrams(tokens), ...ngrams(corrected)]);
  const keys = new Map(); // key -> the phrase that produced it (for explanation)
  for (const ph of phrases) {
    const key = index.synonyms.get(ph) || ph;
    if (!keys.has(key)) keys.set(key, ph);
  }
  return keys;
}

const idf = (index, key) => 1 + Math.log(index.N / (index.df.get(key) || 1));

/**
 * Rank records for a query.
 * @returns {{matches: Array<{id, record, score, matchedTerms:string[]}>, top?:object, ambiguous:boolean, confident:boolean}}
 */
export function search(query, index, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const queryKeys = extractQueryKeys(query, index);

  const scored = [];
  for (const d of index.docs) {
    let score = 0;
    const matchedTerms = [];
    for (const [key, phrase] of queryKeys) {
      const isName = d.nameKeys.has(key);
      if (!isName && !d.symptomKeys.has(key)) continue;
      score += idf(index, key) * (isName ? cfg.nameBoost : 1);
      matchedTerms.push(phrase);
    }
    if (score > 0) scored.push({ id: d.id, record: d.rec, score: +score.toFixed(3), matchedTerms });
  }
  scored.sort((a, b) => b.score - a.score);
  const matches = scored.slice(0, cfg.maxResults);

  const top = matches[0];
  const second = matches[1];
  const confident = !!top && top.score >= cfg.minScore;
  const ambiguous = confident && !!second && second.score >= cfg.minScore && top.score / second.score < cfg.ambiguityRatio;

  return { matches, top, ambiguous, confident };
}
