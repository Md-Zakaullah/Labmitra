// Deterministic safety rules. These run BEFORE retrieval and BEFORE any AI call.
// The AI can never override them.
//
// IMPORTANT: keyword-based emergency detection is NOT a complete clinical triage.
// It must be reviewed and extended by qualified clinicians before real-world use.

import { liteNormalize } from "./normalize.js";

export const DISCLAIMER =
  "यह जानकारी केवल शैक्षणिक (educational) उद्देश्य के लिए है और किसी qualified डॉक्टर की सलाह का विकल्प नहीं है।";

export const LEVEL2_MESSAGE =
  "क्षमा करें, उपलब्ध medical reference information के आधार पर आपके लक्षणों के बारे में सटीक जानकारी देना संभव नहीं है। कृपया qualified doctor से परामर्श लें।";

export const unreviewedTopicMessage = (name) =>
  `आपने जिस विषय (${name}) के बारे में पूछा है, उसकी medical information अभी हमारी medical review प्रक्रिया में है, इसलिए अभी हम इसे साझा नहीं कर सकते। कृपया qualified doctor से परामर्श लें।`;

const EMERGENCY_NUMBERS =
  "भारत में आपातकाल के लिए 112 पर कॉल करें (कई राज्यों में एम्बुलेंस के लिए 108)।";

const EMERGENCY_MESSAGE = (what) =>
  `⚠️ आपके बताए लक्षण (${what}) गंभीर हो सकते हैं। कृपया इंतज़ार न करें और तुरंत medical help लें: ${EMERGENCY_NUMBERS} या नज़दीकी अस्पताल के Emergency में जाएँ। जब तक मदद न पहुँचे, मरीज़ को अकेला न छोड़ें। यह चैट आपातकालीन इलाज का विकल्प नहीं है।`;

const SELF_HARM_MESSAGE =
  "आप जो महसूस कर रहे हैं वह बहुत मायने रखता है और आप अकेले नहीं हैं। कृपया अभी किसी भरोसेमंद व्यक्ति से बात करें और तुरंत मदद लें: 112 पर कॉल करें, या सरकारी Tele-MANAS हेल्पलाइन (14416) पर संपर्क करें। अगर आप खुद को नुकसान पहुँचाने के क़रीब हैं, तो नज़दीकी अस्पताल के Emergency में जाएँ।";

// negatable: "no chest pain" should NOT trigger; "saans nahi aa rahi" must trigger (negation is part of the symptom).
const RULES = [
  {
    id: "chest_pain",
    label: "सीने में तेज दर्द / chest pain",
    negatable: true,
    re: /(chest (pain|tightness|pressure|heaviness)|pain in (my )?chest|seene (me|mein|main)? ?(tez |bahut |bhari |bhaari )?(dard|dabav|dabaav|jakdan|bhaaripan)|सीने (में )?(तेज |बहुत |भारी )?(दर्द|दबाव|जकड़न|भारीपन))/,
  },
  {
    id: "breathing",
    label: "सांस लेने में गंभीर कठिनाई",
    negatable: false,
    re: /(cant breathe|cannot breathe|can not breathe|unable to breathe|struggling to breathe|severe (breathing|breathlessness)|gasping|sa+n?s (nah+i+n?|ni) (aa|le|a) ?(rah|pa|sak)|sa+n?s (lene )?(me|mein|main) (bahut |bohot )?(takl?if|dikkat|mushkil)|dam ghut|सांस (नहीं|ना) (आ|ले|पा)|साँस (नहीं|ना) (आ|ले|पा)|सांस लेने में (बहुत )?(तकलीफ|दिक्कत|मुश्किल)|साँस लेने में (बहुत )?(तकलीफ|दिक्कत|मुश्किल)|दम घुट)/,
  },
  {
    id: "unconscious",
    label: "बेहोशी / unconsciousness",
    negatable: true,
    re: /(unconscious|not responding|wont wake|not waking|passed out|behosh|be hosh|बेहोश|होश नहीं)/,
  },
  {
    id: "bleeding",
    label: "गंभीर रक्तस्राव / severe bleeding",
    negatable: true,
    re: /(severe bleeding|heavy bleeding|bleeding (wont|will not|does not|doesnt) stop|vomiting blood|vomit(ing)? with blood|coughing (up )?blood|blood in vomit|khoon (band )?(nah+i+n?|ni) (ruk|ho)|bahut (zyada |jyada )?khoon|khoon ki ulti|ulti (me|mein) khoon|खून (नहीं रुक|बंद नहीं)|बहुत (ज्यादा |ज़्यादा )?खून|खून की उल्टी|उल्टी में खून)/,
  },
  {
    id: "seizure",
    label: "दौरा / seizure",
    negatable: true,
    re: /(seizure|convulsion|mirgi ka dora|mirgi ka daura|dora pad|daura pad|jhatke aa|मिर्गी का दौरा|दौरा पड़|झटके आ)/,
  },
  {
    id: "stroke_signs",
    label: "स्ट्रोक के संकेत",
    negatable: true,
    re: /(face drooping|facial droop|slurred speech|sudden (weakness|numbness) (on|in) one side|one side (of body )?(weak|numb|paralys)|paralysis attack|lakva|chehra tedha|zubaan lad?kh?ad|लकवा|चेहरा टेढ़ा|ज़ुबान लड़खड़|जुबान लड़खड़)/,
  },
  {
    id: "self_harm",
    label: "खुद को नुकसान पहुँचाने के विचार",
    negatable: true,
    selfHarm: true,
    re: /(suicide|suicidal|kill myself|end my life|want to die|self harm|marna chah|jaan de(na|ne)|aatmahatya|atmahatya|khud ko (khatam|nuksan)|आत्महत्या|मरना चाह|जान दे|ख़ुद को खत्म|खुद को खत्म)/,
  },
];

const NEGATORS = new Set([
  "no", "not", "never", "without", "nahi", "nahin", "nhi", "na", "koi", "nai",
  "नहीं", "न", "ना", "बिना", "कोई",
]);

function isNegated(text, matchIndex, matchLength) {
  const before = text.slice(0, matchIndex).trim().split(" ").slice(-3);
  const after = text.slice(matchIndex + matchLength).trim().split(" ").slice(0, 3);
  return [...before, ...after].some((w) => NEGATORS.has(w));
}

/**
 * Deterministic emergency check.
 * @returns {{emergency:boolean, type?:string, label?:string, message?:string}}
 */
export function checkEmergency(userText) {
  const text = liteNormalize(userText);
  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    if (rule.negatable && isNegated(text, m.index, m[0].length)) continue;
    return {
      emergency: true,
      type: rule.id,
      label: rule.label,
      message: rule.selfHarm ? SELF_HARM_MESSAGE : EMERGENCY_MESSAGE(rule.label),
    };
  }
  return { emergency: false };
}

/** Cheap prompt-injection signal. Used only for logging flags / extra caution, never to allow anything. */
const INJECTION_RE =
  /(ignore (all |any |the )?(previous|above|prior) (instructions|rules)|disregard (the )?(rules|instructions)|system prompt|reveal (your )?(prompt|instructions)|you are now|act as (a )?(doctor|physician)|developer mode|jailbreak|pichle (saare )?(nirdesh|instructions) (bhool|ignore)|पिछले निर्देश)/;

export function looksLikeInjection(userText) {
  return INJECTION_RE.test(liteNormalize(userText));
}

/** Post-check on AI output. If this fails, we discard the AI text and use the deterministic template. */
const DOSAGE_RE = /\b\d+(\.\d+)?\s?(mg|mcg|µg|ml|iu|units?|tablets?|tab|capsules?|drops?)\b/i;
const URL_RE = /https?:\/\/|www\./i;
const DIAGNOSIS_RE =
  /(you (definitely |certainly )?(have|are suffering from)\b|aapko (pakka|definitely|confirm(ed)?)\b|pakka (hai|hain)\b|confirmed (case|diagnosis)|\bdiagnosed with\b)/i;

export function validateAiOutput(text) {
  if (typeof text !== "string") return false;
  const t = text.trim();
  if (t.length < 40 || t.length > 4000) return false;
  if (DOSAGE_RE.test(t)) return false;
  if (URL_RE.test(t)) return false;
  if (DIAGNOSIS_RE.test(t)) return false;
  return true;
}
