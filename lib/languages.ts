export const LANGUAGES = [
  { code: "hinglish", label: "Hinglish", tts: "hi-IN" },
  { code: "hi", label: "हिन्दी", tts: "hi-IN" },
  { code: "en", label: "English", tts: "en-IN" },
  { code: "ur", label: "اردو", tts: "ur-IN" },
  { code: "bn", label: "বাংলা", tts: "bn-IN" },
  { code: "ta", label: "தமிழ்", tts: "ta-IN" },
  { code: "te", label: "తెలుగు", tts: "te-IN" },
  { code: "mr", label: "मराठी", tts: "mr-IN" },
  { code: "gu", label: "ગુજરાતી", tts: "gu-IN" },
  { code: "kn", label: "ಕನ್ನಡ", tts: "kn-IN" },
  { code: "ml", label: "മലയാളം", tts: "ml-IN" },
  { code: "pa", label: "ਪੰਜਾਬੀ", tts: "pa-IN" },
  { code: "or", label: "ଓଡ଼ିଆ", tts: "or-IN" },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];

const STATE_LANG: Record<string, LangCode> = {
  BR: "hi", UP: "hi", MP: "hi", RJ: "hi", DL: "hi", HR: "hi",
  UT: "hi", UK: "hi", JH: "hi", CG: "hi", CT: "hi", HP: "hi",
  WB: "bn", TN: "ta", AP: "te", TS: "te", TG: "te", MH: "mr",
  GJ: "gu", KA: "kn", KL: "ml", PB: "pa", OD: "or", OR: "or",
};

export function langFromRegion(region?: string | null): LangCode {
  return (region && STATE_LANG[region.toUpperCase()]) || "hinglish";
}

export const langLabel = (c: string) =>
  LANGUAGES.find((l) => l.code === c)?.label ?? "English";
