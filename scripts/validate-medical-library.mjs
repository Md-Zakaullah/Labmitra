// Usage: node scripts/validate-medical-library.mjs
// Exit code 1 on errors (use it in CI). Warnings never fail the run.
import fs from "node:fs";
import path from "node:path";
import { normalizeText } from "../src/lib/medical-rag/normalize.js";

const ROOT = path.join(process.cwd(), "src", "data", "medical-library");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf-8"));

const synonymPhrases = new Set(
  Object.entries(read(path.join(ROOT, "_meta", "symptom-synonyms.json")))
    .filter(([k]) => !k.startsWith("_"))
    .flatMap(([, v]) => v.map(normalizeText))
);

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const categories = read(path.join(ROOT, "_meta", "categories.json"));
const catIds = new Set(categories.map((c) => c.id));
if (catIds.size !== 20) warn(`categories.json has ${catIds.size} categories (expected 20)`);

const REQUIRED = [
  "id", "name_en", "name_hi", "category", "summary", "symptoms", "keywords", "causes", "risk_factors",
  "tests", "specialist", "prevention", "lifestyle", "red_flags", "when_to_consult", "special_populations",
  "faqs", "sources", "dates", "review",
];
const STATUSES = new Set(["pending_review", "in_review", "verified", "rejected"]);
const URL_STATUSES = new Set(["needs_source", "unchecked", "seen_in_search", "checked_by_reviewer"]);
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

const ids = new Map();
const keywordOwners = new Map();
const condDir = path.join(ROOT, "conditions");

for (const file of fs.readdirSync(condDir).filter((f) => f.endsWith(".json")).sort()) {
  const cat = file.replace(/\.json$/, "");
  if (!catIds.has(cat)) err(`${file}: file name is not a known category id`);
  let arr;
  try { arr = read(path.join(condDir, file)); } catch (e) { err(`${file}: invalid JSON (${e.message})`); continue; }
  if (!Array.isArray(arr)) { err(`${file}: must contain an array`); continue; }

  for (const r of arr) {
    const where = `${file}:${r.id ?? "(no id)"}`;
    for (const k of REQUIRED) if (r[k] === undefined || r[k] === null) err(`${where}: missing "${k}"`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id || "")) err(`${where}: id must be kebab-case`);
    if (ids.has(r.id)) err(`${where}: duplicate id (also in ${ids.get(r.id)})`); else ids.set(r.id, file);
    if (r.category !== cat) err(`${where}: category "${r.category}" does not match file "${cat}"`);

    for (const lang of ["hi", "en", "hinglish"]) {
      if (!Array.isArray(r.keywords?.[lang]) || r.keywords[lang].length === 0) err(`${where}: keywords.${lang} must be a non-empty array`);
    }
    for (const lang of ["hi", "en", "hinglish"]) {
      for (const kw of r.keywords?.[lang] || []) {
        const n = normalizeText(kw);
        if (!keywordOwners.has(n)) keywordOwners.set(n, new Set());
        keywordOwners.get(n).add(r.id);
      }
    }
    if (!Array.isArray(r.tests) || r.tests.length === 0) err(`${where}: needs at least one test`);
    for (const t of r.tests || []) {
      if (!t.name || !t.type || !t.purpose) err(`${where}: test needs name, type, purpose`);
      if (!t.preparation || typeof t.preparation !== "object") err(`${where}: test "${t.name}" needs a preparation object`);
      else if (JSON.stringify(t.preparation).match(/\balways\b.*\bfast/i)) warn(`${where}: test "${t.name}" may impose a universal fasting rule`);
    }
    if (!r.specialist?.primary) err(`${where}: specialist.primary missing`);
    if (!Array.isArray(r.red_flags) || r.red_flags.length === 0) err(`${where}: red_flags required`);
    if (!Array.isArray(r.sources) || r.sources.length === 0) err(`${where}: at least one source required`);
    for (const s of r.sources || []) {
      if (!s.organization || !s.title) err(`${where}: source needs organization and title`);
      if (s.url && !/^https:\/\//.test(s.url)) err(`${where}: source url must start with https://`);
      if (!URL_STATUSES.has(s.url_status)) err(`${where}: invalid source url_status "${s.url_status}"`);
      if (s.url === null && s.url_status !== "needs_source") err(`${where}: source without url must use url_status "needs_source"`);
    }
    if (!isDate(r.dates?.published) || !isDate(r.dates?.updated)) err(`${where}: dates.published/updated must be YYYY-MM-DD`);

    const rv = r.review || {};
    if (!STATUSES.has(rv.status)) err(`${where}: invalid review.status`);
    if (rv.status === "verified") {
      if (!rv.reviewer) err(`${where}: VERIFIED requires review.reviewer`);
      if (!isDate(rv.last_verified)) err(`${where}: VERIFIED requires review.last_verified (YYYY-MM-DD)`);
      for (const s of r.sources || []) {
        if (!s.url || s.url_status !== "checked_by_reviewer") err(`${where}: VERIFIED requires every source to have a url with url_status "checked_by_reviewer" ("${s.title}")`);
      }
    } else if (rv.last_verified) {
      err(`${where}: last_verified must be null unless status is verified`);
    }
  }
}

// de-duplication report
for (const [kw, owners] of keywordOwners) {
  if (owners.size > 1 && kw.split(" ").length === 1 && !synonymPhrases.has(kw)) warn(`shared single-word keyword "${kw}" used by: ${[...owners].join(", ")} (consider moving it to _meta/symptom-synonyms.json)`);
}

// planned catalog
const plannedRaw = read(path.join(ROOT, "_meta", "catalog-planned.json"));
const planned = Array.isArray(plannedRaw) ? plannedRaw : plannedRaw.topics || [];
const seen = new Set();
for (const p of planned) {
  if (!catIds.has(p.cat)) err(`catalog-planned: ${p.id} has unknown category ${p.cat}`);
  if (seen.has(p.id)) err(`catalog-planned: duplicate id ${p.id}`);
  seen.add(p.id);
  if (ids.has(p.id)) warn(`catalog-planned: ${p.id} is already authored; entry is ignored and can be deleted`);
}

const verified = [...ids.keys()].length;
console.log(`Records: ${verified} authored, ${planned.length} planned topics, ${catIds.size} categories`);
for (const w of warnings) console.warn("WARN ", w);
for (const e of errors) console.error("ERROR", e);
console.log(errors.length ? `\nFAILED with ${errors.length} error(s)` : "\nOK: library structure is valid");
process.exit(errors.length ? 1 : 0);
