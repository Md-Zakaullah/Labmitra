"use client";
import { useEffect, useRef, useState } from "react";
import { LANGUAGES, LangCode } from "@/lib/languages";

type Result = {
  isMedicalReport: boolean;
  reportType?: string;
  summary: string;
  conditions: { name: string; why: string; severity: string }[];
  abnormalValues: { test: string; value: string; normalRange: string; status: string; meaning: string }[];
  diet: { eat: string[]; avoid: string[]; lifestyle: string[] };
  doctors: { rank: number; specialty: string; degree: string; reason: string; urgency: string }[];
  audioScript: string;
  disclaimer: string;
};

async function compress(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = bmp.width * scale;
  c.height = bmp.height * scale;
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.85));
  return new File([blob], "report.jpg", { type: "image/jpeg" });
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [lang, setLang] = useState<LangCode>("hinglish");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioLoading, setAudioLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioMsg, setAudioMsg] = useState("");
  const [drag, setDrag] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetch("/api/geo").then((r) => r.json()).then((g) => {
      if (g.language) setLang(g.language);
      if (g.city) setCity(g.city);
    }).catch(() => {});
  }, []);

  async function pick(f: File | undefined) {
    if (!f) return;
    setError("");
    if (!/^(image\/|application\/pdf)/.test(f.type)) return setError("Sirf image ya PDF upload karo");
    const out = await compress(f);
    if (out.size > 4 * 1024 * 1024) return setError("File 4MB se badi hai");
    setFile(out);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true); setError(""); setResult(null); setAudioUrl(""); setPlaying(false);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("language", lang);
    fd.append("city", city || "India");
    try {
      const r = await fetch("/api/analyze", { method: "POST", body: fd });
      const t = await r.text();
      let j: any;
      try {
        j = JSON.parse(t);
      } catch {
        throw new Error("Server ne time par jawab nahi diya (busy ya slow). 1 minute baad dobara try karo.");
      }
      if (!r.ok) throw new Error(j.error);
      setResult(j);
    } catch (e: any) {
      setError(e.message || "Kuch gadbad ho gayi");
    } finally {
      setLoading(false);
    }
  }

  function browserSpeak() {
    if (!result) return;
    if (!("speechSynthesis" in window)) {
      setAudioMsg("Is browser mein audio support nahi hai");
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(result.audioScript);
    u.lang = LANGUAGES.find((l) => l.code === lang)?.tts || "hi-IN";
    u.onstart = () => setPlaying(true);
    u.onend = () => setPlaying(false);
    u.onerror = () => {
      setPlaying(false);
      setAudioMsg("Audio nahi chal paya. Phone/computer mein is bhasha ki awaaz install nahi ho sakti.");
    };
    setAudioMsg("Gemini awaaz abhi available nahi, browser ki awaaz chal rahi hai");
    speechSynthesis.speak(u);
  }

  async function togglePlay() {
    const a = audioRef.current;
    if (!a || !result) return;
    if (playing) {
      a.pause();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    setAudioMsg("");
    if (!audioUrl) {
      setAudioLoading(true);
      try {
        const r = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: result.audioScript }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "TTS fail");
        }
        const url = URL.createObjectURL(await r.blob());
        setAudioUrl(url);
        a.src = url;
        setAudioLoading(false);
        await a.play();
      } catch {
        setAudioLoading(false);
        browserSpeak();
      }
      return;
    }
    try {
      await a.play();
    } catch {
      browserSpeak();
    }
  }

  return (
    <main className="wrap">
      <header>
        <h1>🩺 LabMitra</h1>
        <p>Lab report upload karo, apni bhasha mein samjho.</p>
      </header>

      <section className="card">
        <label>Bhasha chuno</label>
        <select value={lang} onChange={(e) => { setLang(e.target.value as LangCode); setAudioUrl(""); }}>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>

        <div
          className={`drop ${drag ? "on" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
          onClick={() => document.getElementById("f")?.click()}
        >
          <input id="f" type="file" accept="image/*,application/pdf" hidden
                 onChange={(e) => pick(e.target.files?.[0])} />
          {file ? `✅ ${file.name} (${(file.size / 1024).toFixed(0)} KB)` : "📄 Report yahan drag karo ya click karo (Image / PDF)"}
        </div>

        <button className="primary" disabled={!file || loading} onClick={analyze}>
          {loading ? "Samajh raha hoon…" : "Report Samjhao"}
        </button>
        {error && <p className="err">{error}</p>}
      </section>

      {result && (
        <>
          {result.isMedicalReport && (
            <button className="audio" onClick={togglePlay} disabled={audioLoading}>
              {audioLoading ? "⏳ Audio ban raha hai…" : playing ? "⏸ Pause" : "🔊 Suno / Play"}
            </button>
          )}
          {audioMsg && <p className="err">{audioMsg}</p>}
          <audio ref={audioRef} src={audioUrl || undefined}
                 onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                 onEnded={() => setPlaying(false)} />

          <section className="card">
            <h2>📋 Report ka Saar</h2>
            <p>{result.summary}</p>
          </section>

          {result.conditions.length > 0 && (
            <section className="card">
              <h2>⚠️ Ho Sakti Samasya</h2>
              {result.conditions.map((c, i) => (
                <div key={i} className="row">
                  <b>{c.name}</b> <span className={`tag ${c.severity}`}>{c.severity}</span>
                  <p>{c.why}</p>
                </div>
              ))}
            </section>
          )}

          {result.abnormalValues.length > 0 && (
            <section className="card">
              <h2>🧪 Gadbad Wali Values</h2>
              <div className="grid">
                {result.abnormalValues.map((v, i) => (
                  <div key={i} className="metric">
                    <b>{v.test}</b>
                    <div className="big">{v.value}</div>
                    <small>Normal: {v.normalRange} • {v.status}</small>
                    <p>{v.meaning}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.isMedicalReport && (
            <section className="card">
              <h2>🥗 Diet & Lifestyle</h2>
              <h3>✅ Khao</h3><ul>{result.diet.eat.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <h3>❌ Avoid karo</h3><ul>{result.diet.avoid.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <h3>🏃 Lifestyle</h3><ul>{result.diet.lifestyle.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
          )}

          {result.doctors.length > 0 && (
            <section className="card">
              <h2>👨‍⚕️ Kis Doctor Ko Dikhayein</h2>
              {result.doctors.map((d) => (
                <div key={d.rank} className="doc">
                  <div className="rank">#{d.rank}</div>
                  <div>
                    <b>{d.specialty}</b> <small>({d.degree})</small>{" "}
                    <span className={`tag ${d.urgency}`}>{d.urgency}</span>
                    <p>{d.reason}</p>
                    <a target="_blank" rel="noreferrer"
                       href={`https://www.google.com/search?q=${encodeURIComponent(`best ${d.specialty} doctor ${d.degree} in ${city || "near me"}`)}`}>
                      🔎 Nearby doctor search
                    </a>
                  </div>
                </div>
              ))}
              <small>
                Doctor ki degree <a target="_blank" rel="noreferrer" href="https://www.nmc.org.in/information-desk/indian-medical-register/">NMC register</a> pe verify kar lo.
              </small>
            </section>
          )}

          <p className="disc">⚕️ {result.disclaimer}</p>
        </>
      )}
    </main>
  );
}
