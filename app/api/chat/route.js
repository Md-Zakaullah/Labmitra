// Labmitra Medical Information Assistant (NOT an AI doctor).
//
// Order of decisions (backend rules always beat the model):
//   1. validate request  ->  2. authorize  ->  3. rate limit
//   4. deterministic EMERGENCY check (no AI)          => LEVEL 3
//   5. retrieval from the server-side library
//        no/low confidence, ambiguous, or topic not available/unreviewed  => LEVEL 2 (fixed message, no AI)
//        confident single match                                           => LEVEL 1
//   6. LEVEL 1 only: AI rewrites the retrieved record in simple Hinglish.
//      If AI fails/times out/violates output checks -> deterministic template (no AI).

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

import { sanitizeUserInput } from "../../../src/lib/medical-rag/normalize.js";
import { search } from "../../../src/lib/medical-rag/retrieval.js";
import {
  checkEmergency, looksLikeInjection, validateAiOutput,
  DISCLAIMER, LEVEL2_MESSAGE, unreviewedTopicMessage,
} from "../../../src/lib/medical-rag/safety.js";
import { buildSystemPrompt, renderTemplateAnswer, toStructured, banner } from "../../../src/lib/medical-rag/medical-context.js";
import { loadLibrary, isVerified } from "../../../src/lib/medical-rag/library.js";
import { authorizeRequest } from "../../../src/lib/medical-rag/auth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 4096;
const MAX_MESSAGE_CHARS = 500;
const AI_TIMEOUT_MS = 12_000;

// Should records that are not doctor-verified be shown (always with a "review pending" banner)?
// Priority: env var MEDICAL_ALLOW_UNREVIEWED (true/false) > _meta/runtime-config.json (if present) > ON.
// To turn it OFF: set env var MEDICAL_ALLOW_UNREVIEWED=false (Vercel) or change this default to false.
function unreviewedPolicy() {
  const env = String(process.env.MEDICAL_ALLOW_UNREVIEWED ?? "").trim().toLowerCase();
  if (["true", "1", "yes"].includes(env)) return { allow: true, source: "env" };
  if (["false", "0", "no"].includes(env)) return { allow: false, source: "env" };
  try {
    const flag = loadLibrary().config?.allow_unreviewed_content;
    if (typeof flag === "boolean") return { allow: flag, source: "config_file" };
  } catch {}
  return { allow: true, source: "code_default" };
}

const baseResponse = (over) => ({
  response: "",
  response_level: 2,
  reason: null,
  response_source: "rules", // rules | ai | template
  verification_status: null,
  matched_conditions: [],
  recommended_specialist: null,
  tests: [],
  tips: [],
  red_flags: [],
  sources: [],
  emergency: { detected: false },
  disclaimer: DISCLAIMER,
  ...over,
});

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Best-effort limiter (resets on cold start, not shared between instances). It is only a
// backstop. Use Vercel Firewall rate limiting (or Upstash Redis) as the real limiter.
const hits = new Map();
function rateLimited(ip, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const rec = hits.get(ip);
  if (!rec || now > rec.reset) { hits.set(ip, { count: 1, reset: now + windowMs }); return false; }
  rec.count += 1;
  return rec.count > limit;
}

function getModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(process.env.ANTHROPIC_MODEL || "claude-haiku-5-5");
  }
  if (process.env.GEMINI_API_KEY) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
    return google(process.env.GEMINI_MODEL || "gemini-3.8-flash");
  }
  return null; // no key: we still answer, using the deterministic template
}

export async function POST(req) {
  try {
    // 1. request validation
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return json({ error: "invalid_content_type" }, 415);
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
    if (!body || typeof body.message !== "string") return json({ error: "message_required" }, 400);
    const message = sanitizeUserInput(body.message, MAX_MESSAGE_CHARS + 1);
    if (!message) return json({ error: "message_required" }, 400);
    if (message.length > MAX_MESSAGE_CHARS) return json({ error: "message_too_long", max: MAX_MESSAGE_CHARS }, 400);

    // 2. authorization hook
    const auth = await authorizeRequest(req);
    if (!auth.ok) return json({ error: auth.error || "unauthorized" }, auth.status || 401);

    // 3. rate limit
    const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    if (rateLimited(ip)) return json({ error: "rate_limited" }, 429);

    // 4. EMERGENCY: deterministic, before retrieval and before any AI call
    const em = checkEmergency(message);
    if (em.emergency) {
      return json(baseResponse({
        response: em.message,
        response_level: 3,
        reason: em.type,
        emergency: { detected: true, type: em.type, numbers: ["112", "108"] },
      }));
    }

    // 5. retrieval
    const lib = loadLibrary();
    const found = search(message, lib.index);

    if (!found.confident) {
      const planned = search(message, lib.plannedIndex);
      if (planned.confident && !planned.ambiguous) {
        return json(baseResponse({
          response: unreviewedTopicMessage(planned.top.record.name_en),
          reason: "topic_not_available",
        }));
      }
      return json(baseResponse({ response: LEVEL2_MESSAGE, reason: "no_reliable_match" }));
    }
    if (found.ambiguous) {
      return json(baseResponse({ response: LEVEL2_MESSAGE, reason: "multiple_possible_conditions" }));
    }

    const rec = found.top.record;
    if (!isVerified(rec) && !unreviewedPolicy().allow) {
      return json(baseResponse({
        response: unreviewedTopicMessage(rec.name_en),
        reason: "pending_medical_review",
      }));
    }

    // 6. LEVEL 1: explain the retrieved record (AI optional, rules decide the content)
    let answer = null;
    let source = "template";
    const model = getModel();
    if (model) {
      try {
        const { text } = await generateText({
          model,
          system: buildSystemPrompt(rec),
          prompt: `<user_message>\n${message}\n</user_message>`,
          temperature: 0.1,
          maxOutputTokens: 900,
          abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
        });
        if (validateAiOutput(text) && !looksLikeInjection(text)) {
          answer = `${banner(rec)}\n\n${text.trim()}\n\n${DISCLAIMER}`;
          source = "ai";
        }
      } catch (e) {
        console.error("[/api/chat] ai_provider_error:", e?.name || "error"); // never log user text
      }
    }
    if (!answer) answer = renderTemplateAnswer(rec);

    const s = toStructured(rec);
    return json(baseResponse({
      response: answer,
      response_level: 1,
      reason: "matched_reference",
      response_source: source,
      verification_status: s.matched_condition.verification_status,
      matched_conditions: [s.matched_condition],
      recommended_specialist: s.recommended_specialist,
      tests: s.tests,
      tips: s.tips,
      red_flags: s.red_flags,
      sources: s.sources,
    }));
  } catch (err) {
    console.error("[/api/chat] error:", err?.name || "error");
    return json(baseResponse({
      response: "क्षमा करें, अभी तकनीकी समस्या आ गई है। कृपया थोड़ी देर बाद दोबारा कोशिश करें। अगर आपकी स्थिति गंभीर लग रही है तो तुरंत डॉक्टर या 112 से संपर्क करें।",
      reason: "server_error",
    }), 500);
  }
}

// Health check: open /api/chat in the browser. Shows config status only, never secrets or values.
// (You can delete this function after setup if you do not want it public.)
export function GET() {
  let records = null;
  let verified = null;
  try {
    const lib = loadLibrary();
    records = lib.records.length;
    verified = lib.records.filter(isVerified).length;
  } catch {
    records = "load_error";
  }
  return json({
    ok: true,
    allow_unreviewed: unreviewedPolicy().allow,
    allow_unreviewed_source: unreviewedPolicy().source,
    env_var_present: process.env.MEDICAL_ALLOW_UNREVIEWED !== undefined,
    records,
    verified_records: verified,
    ai_key_present: Boolean(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY),
  });
}
