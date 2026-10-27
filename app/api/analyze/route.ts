import { GoogleGenAI } from "@google/genai";

export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pehle GEMINI_TTS_MODEL, phir backup audio models
const TTS_MODELS = Array.from(
  new Set(
    [
      process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview",
      ...(process.env.GEMINI_TTS_FALLBACK_MODELS || "gemini-2.5-flash-preview-tts").split(","),
    ]
      .map((m) => m.trim())
      .filter(Boolean)
  )
);

// Gemini TTS raw PCM (16-bit, mono) deta hai -> WAV header lagao
function pcmToWav(pcm: Buffer, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY)
      return Response.json({ error: "GEMINI_API_KEY set nahi hai" }, { status: 500 });
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const { text } = await req.json();
    if (!text || text.length > 2000)
      return Response.json({ error: "Invalid text" }, { status: 400 });

    let lastErr = "";
    for (const model of TTS_MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ text }] }],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
            },
          });
          const part = res.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
          const b64 = part?.inlineData?.data;
          if (!b64) throw new Error("No audio in response");
          const rate = Number(/rate=(\d+)/.exec(part?.inlineData?.mimeType || "")?.[1]) || 24000;
          const wav = pcmToWav(Buffer.from(b64, "base64"), rate);
          return new Response(new Uint8Array(wav), {
            headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
          });
        } catch (e: any) {
          lastErr = String(e?.message || e).slice(0, 200);
          console.error("TTS", model, lastErr);
          if (/503|429|UNAVAILABLE|high demand/i.test(lastErr) && attempt === 0) await sleep(1200);
          else break;
        }
      }
    }
    return Response.json({ error: "Audio nahi bana: " + lastErr }, { status: 500 });
  } catch (e: any) {
    console.error(e);
    return Response.json({ error: "Audio generate nahi hua" }, { status: 500 });
  }
}
