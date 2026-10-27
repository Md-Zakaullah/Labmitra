import { GoogleGenAI, Type } from "@google/genai";
import { langLabel } from "@/lib/languages";

export const maxDuration = 60;

const SYSTEM = `You are LabMitra, a friendly medical-report explainer for common people in India.
You read an uploaded lab report (image/PDF) and explain it in very simple words.

RULES:
- Write ALL text fields in the requested language. If language is "Hinglish", use Hindi written in Roman/English letters mixed with simple English words. Use simple everyday words; explain any medical term.
- You are NOT a doctor. Never claim a confirmed diagnosis. Use "possible / ho sakta hai" style language.
- Read every value carefully. Compare with the reference range printed on the report. If absent, use standard adult ranges and say so.
- Only list abnormal values in "abnormalValues". Mention normal results briefly in "summary".
- "conditions": likely health issues suggested by abnormal values, short reason, severity (low/medium/high).
- "diet": practical, affordable, LOCAL food advice using the user's city/state. Specific to the abnormal values.
- "doctors": exactly 3 specialties ranked by priority (rank 1 = most important), with typical degree (e.g. MD Medicine, DM Nephrology, DNB) and urgency (routine/soon/urgent).
- If any value is critically abnormal, mark rank 1 as "urgent" and say to see a doctor immediately.
- "audioScript": 30-40 second spoken script (about 90-110 words) in the requested language: greeting, main finding, top 2 diet tips, which doctor to see, closing line to consult a doctor. No lists, symbols or markdown.
- If the file is not a medical report, set isMedicalReport=false, explain briefly in "summary", leave arrays empty.
- Always include a short disclaimer in the requested language.`;

const str = { type: Type.STRING };
const strArr = { type: Type.ARRAY, items: { type: Type.STRING } };
const obj = (properties: any) => ({
  type: Type.OBJECT, properties, required: Object.keys(properties),
});

const schema = obj({
  isMedicalReport: { type: Type.BOOLEAN },
  reportType: str,
  summary: str,
  conditions: { type: Type.ARRAY, items: obj({ name: str, why: str, severity: str }) },
  abnormalValues: {
    type: Type.ARRAY,
    items: obj({ test: str, value: str, normalRange: str, status: str, meaning: str }),
  },
  diet: obj({ eat: strArr, avoid: strArr, lifestyle: strArr }),
  doctors: {
    type: Type.ARRAY,
    items: obj({ rank: { type: Type.INTEGER }, specialty: str, degree: str, reason: str, urgency: str }),
  },
  audioScript: str,
  disclaimer: str,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pehle GEMINI_MODEL, phir backup models (GEMINI_FALLBACK_MODELS, comma se alag)
const MODELS = Array.from(
  new Set(
    [
      process.env.GEMINI_MODEL || "gemini-3.8-flash",
      ...(process.env.GEMINI_FALLBACK_MODELS || "gemini-3.6-flash,gemini-3.5-flash").split(","),
    ]
      .map((m) => m.trim())
      .filter(Boolean)
  )
);

// Busy (503/429) ya model band (404) hone par retry + backup model
async function generate(ai: GoogleGenAI, params: any) {
  let lastErr: any;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ai.models.generateContent({ ...params, model });
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message || "");
        const busy = /503|429|UNAVAILABLE|high demand|RESOURCE_EXHAUSTED/i.test(msg);
        const gone = /404|no longer available|not found/i.test(msg);
        if (!busy && !gone) throw e;
        if (busy && attempt === 0) await sleep(1500);
        else break;
      }
    }
  }
  throw lastErr;
}

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY)
      return Response.json({ error: "GEMINI_API_KEY set nahi hai (.env.local check karo)" }, { status: 500 });
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const language = String(form.get("language") || "hinglish");
    const city = String(form.get("city") || "India");

    if (!file) return Response.json({ error: "File missing" }, { status: 400 });
    if (file.size > 4 * 1024 * 1024)
      return Response.json({ error: "File 4MB se chhoti honi chahiye" }, { status: 413 });
    if (!/^(image\/|application\/pdf)/.test(file.type))
      return Response.json({ error: "Sirf image ya PDF" }, { status: 400 });

    const data = Buffer.from(await file.arrayBuffer()).toString("base64");

    const res = await generate(ai, {
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: file.type, data } },
            { text: `Requested language: ${langLabel(language)} (${language}). User location: ${city}. Analyze this lab report.` },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseSchema: schema as any,
        temperature: 0.3,
      },
    });

    const json = JSON.parse(res.text ?? "{}");
    json.doctors?.sort((a: any, b: any) => a.rank - b.rank);
    return Response.json(json);
  } catch (e: any) {
    console.error(e);
    return Response.json({ error: "Analysis fail ho gaya: " + (e?.message?.slice(0, 150) || "dobara try karo") }, { status: 500 });
  }
}
