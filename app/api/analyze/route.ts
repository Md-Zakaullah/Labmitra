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

    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
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
