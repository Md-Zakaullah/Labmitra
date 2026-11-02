import { GoogleGenAI } from "@google/genai";
import tests from "@/lib/medical-knowledge.json";
import diseases from "@/lib/disease-library.json";

export const maxDuration = 30;

const RED_FLAGS = [
  { re: /\b(chest pain|chest pressure|seene mein dard|सीने में दर्द|saans nahi aa|severe breathlessness|difficulty breathing|saans lene mein dikkat)\b/i, message: "Chest pain ya severe breathing difficulty emergency ho sakti hai. Abhi emergency medical help lein; India mein 112 call karein. Khud drive na karein." },
  { re: /\b(face droop|one side weakness|sudden weakness|bol nahi pa|speech difficulty|stroke symptoms|achanak kamzori|लकवा)\b/i, message: "Sudden weakness, face drooping ya speech difficulty stroke ke signs ho sakte hain. Abhi 112 call karein; symptoms shuru hone ka time note karein." },
  { re: /\b(unconscious|not waking|seizure|fit aa|बेहोश| दौरा|heavy bleeding|uncontrolled bleeding)\b/i, message: "Yeh emergency ho sakti hai. Abhi emergency services (India: 112) ya nearest emergency department se madad lein." },
  { re: /\b(suicid(e|al)|kill myself|self harm|marna chahta|khud ko nuksan)\b/i, message: "Aapki safety sabse zaroori hai. Agar turant khatra hai to 112 call karein, nearest emergency department jaayein, aur abhi kisi bharosemand vyakti ko apne paas bulayein." }
];

function retrieve(query: string) {
  const terms = query.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(x => x.length > 2);
  const pool = [
    ...(diseases.entries as any[]).map(x => ({ kind: "condition", ...x })),
    ...(tests.entries as any[]).map(x => ({ kind: "test", ...x }))
  ];
  const scored = pool.map(item => {
    const hay = JSON.stringify(item).toLowerCase();
    const score = terms.reduce((n, term) => n + (hay.includes(term) ? 1 : 0), 0);
    return { item, score };
  }).filter(x => x.score > 0).sort((a,b) => b.score-a.score);
  return scored.slice(0, 6).map(x => x.item);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body?.message || "").trim();
    const language = ["hi", "en", "hinglish"].includes(body?.language) ? body.language : "hinglish";
    if (!question) return Response.json({ error: "Apna sawaal likhein." }, { status: 400 });
    if (question.length > 2000) return Response.json({ error: "Sawaal 2000 characters se chhota rakhein." }, { status: 400 });

    for (const flag of RED_FLAGS) {
      if (flag.re.test(question)) {
        return Response.json({ emergency: true, answer: flag.message, sources: [], disclaimer: "Emergency advice ko AI diagnosis na samjhein." });
      }
    }

    const context = retrieve(question);
    if (!context.length) {
      return Response.json({
        emergency: false,
        answer: "Is sawaal ke liye hamari current reference library mein paryapt verified jaankari nahi hai. Main guess nahi karunga. Kripya qualified doctor/health professional se salah lein; agar symptoms severe ya rapidly worsening hain to urgent medical care lein.",
        sources: [],
        disclaimer: "Yeh general educational information hai, diagnosis ya treatment ka substitute nahi."
      });
    }

    if (!process.env.GEMINI_API_KEY) return Response.json({ error: "Medical assistant abhi configure nahi hai." }, { status: 503 });
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      contents: [{ role: "user", parts: [{ text: `User question: ${question}\nLanguage: ${language}\nReference context (unreviewed educational content; do not call it verified):\n${JSON.stringify(context)}\n\nAnswer in requested language, concise and understandable. You are a medical information assistant, not a doctor. Do not diagnose, prescribe, give drug doses, or invent facts/sources. Explain uncertainty and advise clinician assessment for personal symptoms. If context is insufficient, say so. Mention only sources present in context.` }] }],
      config: { temperature: 0.2, systemInstruction: "You provide general medical education only. Never claim to diagnose or replace a clinician. Do not prescribe medication or dosage. Never fabricate citations, reference ranges or tests. Never provide reassurance that delays emergency care. For emergency symptoms, advise emergency services." }
    });
    return Response.json({
      emergency: false,
      answer: res.text || "Is waqt jawab generate nahi ho saka. Doctor se salah lein.",
      sources: context.map((x: any) => ({ title: x.name || x.Test || x["Test / disease"] || x["Imaging / procedure"] || x.category || "Medical reference", status: x.verificationStatus || "educational_unreviewed", source: x.source || "User-provided workbook" })),
      disclaimer: "Yeh general educational information hai, diagnosis ya treatment ka substitute nahi. Apni condition ke liye qualified clinician se salah lein."
    });
  } catch (error) {
    console.error("medical-chat error", error);
    return Response.json({ error: "Abhi jawab nahi mil paya. Thodi der baad dobara try karein." }, { status: 500 });
  }
}
