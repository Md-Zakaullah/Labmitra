"use client";

import { useState } from "react";
import styles from "./ask.module.css";

const EXAMPLES = [
  "Mujhe tez bukhar aur badan dard hai",
  "Mera sugar high hai aur baar baar peshab aata hai",
  "Periods irregular hain aur chehre par baal aa rahe hain",
];

const ERRORS = {
  rate_limited: "Bahut zyada requests ho gayi hain. Ek minute baad dobara try karein.",
  message_too_long: "Message 500 characters se chhota rakhein.",
  message_required: "Pehle apne lakshan likhein.",
  forbidden_origin: "Is request ko allow nahi kiya gaya.",
};

export default function AskPage() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function ask(text) {
    const q = (text ?? message).trim();
    if (!q || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.response) setResult(data);
      else setError(ERRORS[data.error] || "Kuch gadbad ho gayi. Thodi der baad dobara try karein.");
    } catch {
      setError("Internet connection check karke dobara try karein.");
    } finally {
      setLoading(false);
    }
  }

  const level = result?.response_level;
  const tone = level === 3 ? styles.emergency : level === 1 ? (result.verification_status === "verified" ? styles.verified : styles.pending) : styles.neutral;
  const heading =
    level === 3 ? "Turant madad lein"
    : level === 1 ? (result.verification_status === "verified" ? "Verified jankari" : "Jankari (medical review pending)")
    : "Doctor se salah lein";

  return (
    <main className={styles.page}>
      <a className={styles.back} href="/">← Report samjho</a>
      <h1 className={styles.title}>Lakshan poochho</h1>
      <p className={styles.lead}>
        Apne lakshan likhein. Hum sirf reference jankari dete hain: kaun si tests, kaun sa doctor, kab turant jaana hai. Ye diagnosis nahi hai.
      </p>

      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <label htmlFor="q" className={styles.srOnly}>Aapke lakshan</label>
        <textarea
          id="q"
          className={styles.input}
          rows={3}
          maxLength={500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Jaise: mujhe 3 din se bukhar aur badan dard hai"
        />
        <div className={styles.row}>
          <span className={styles.count}>{message.length}/500</span>
          <button className={styles.button} type="submit" disabled={loading || !message.trim()}>
            {loading ? "Dekh rahe hain..." : "Jankari dikhao"}
          </button>
        </div>
      </form>

      {!result && !error && !loading && (
        <div className={styles.examples}>
          <p>Ye try karein:</p>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className={styles.chip} onClick={() => { setMessage(ex); ask(ex); }}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" className={styles.error}>{error}</p>}

      {result && (
        <section className={`${styles.result} ${tone}`} aria-live="polite">
          <h2 className={styles.resultTitle}>{heading}</h2>
          <div className={styles.text}>{result.response}</div>

          {level === 1 && result.sources?.length > 0 && (
            <details className={styles.sources}>
              <summary>Sources</summary>
              <ul>
                {result.sources.map((s, i) => (
                  <li key={i}>
                    {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.organization}: {s.title}</a> : <>{s.organization}: {s.title}</>}
                    {s.url_status !== "checked_by_reviewer" && <em> (link abhi review mein)</em>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className={styles.disclaimer}>{result.disclaimer}</p>
        </section>
      )}
    </main>
  );
}
