// Server-side loader for the modular medical library.
//   src/data/medical-library/_meta/categories.json
//   src/data/medical-library/_meta/symptom-synonyms.json
//   src/data/medical-library/_meta/catalog-planned.json   (topics planned, NOT yet authored)
//   src/data/medical-library/conditions/<category-id>.json (authored records)
//
// Files are read with fs.readFileSync and cached per warm serverless instance.
// Nothing here is ever sent to the browser as a whole.

import fs from "node:fs";
import path from "node:path";
import { buildIndex } from "./retrieval.js";

const ROOT = () => path.join(process.cwd(), "src", "data", "medical-library");

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e) {
    if (e.code === "ENOENT" && fallback !== undefined) return fallback;
    throw e;
  }
};

let cache = null;

export function loadLibrary({ force = false, root = ROOT() } = {}) {
  if (cache && !force) return cache;

  const categories = readJson(path.join(root, "_meta", "categories.json"), []);
  const synonyms = readJson(path.join(root, "_meta", "symptom-synonyms.json"), {});
  const config = readJson(path.join(root, "_meta", "runtime-config.json"), {});
  const plannedRaw = readJson(path.join(root, "_meta", "catalog-planned.json"), []);
  const planned = Array.isArray(plannedRaw) ? plannedRaw : plannedRaw.topics || [];

  const condDir = path.join(root, "conditions");
  const records = [];
  if (fs.existsSync(condDir)) {
    for (const f of fs.readdirSync(condDir).filter((n) => n.endsWith(".json")).sort()) {
      const arr = readJson(path.join(condDir, f), []);
      if (Array.isArray(arr)) records.push(...arr);
    }
  }

  // Planned topics are searchable by name/keywords only, so we can say
  // "information for this topic is not available yet" instead of guessing.
  const plannedDocs = planned
    .filter((p) => !records.some((r) => r.id === p.id))
    .map((p) => ({
      id: p.id,
      name_en: p.en,
      name_hi: p.hi,
      category: p.cat,
      keywords: { en: p.kw || [], hi: [], hinglish: [] },
    }));

  cache = {
    config,
    categories,
    records,
    byId: new Map(records.map((r) => [r.id, r])),
    index: buildIndex(records, synonyms),
    plannedIndex: buildIndex(plannedDocs, {}),
  };
  return cache;
}

/** "verified" only when the record is explicitly approved. Everything else is unreviewed. */
export const isVerified = (rec) => rec?.review?.status === "verified";
