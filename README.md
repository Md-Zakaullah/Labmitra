# 🩺 LabMitra

**Lab report upload karo, apni bhasha mein samjho.**

LabMitra ek web app hai jo aapki lab report (photo ya PDF) ko padhkar simple bhasha mein samjhata hai: kaunsi value normal hai, kaunsi gadbad hai, kya khana chahiye, aur kis doctor ko dikhana chahiye. Report ka audio summary bhi sun sakte ho.

Built with **Next.js 15 + React 19 + TypeScript** aur **Google Gemini (Google AI Studio)**.

> ⚕️ **Disclaimer:** LabMitra doctor nahi hai. Yeh sirf samajhne mein madad karta hai, diagnosis nahi deta. Kisi bhi faisle se pehle apne doctor se zaroor milo.

---

## ✨ Features

- 📤 **Report upload**: image (JPG/PNG etc.) ya PDF, drag & drop ya click se
- 🌐 **13 bhasha support**: Hinglish, हिन्दी, English, اردو, বাংলা, தமிழ், తెలుగు, मराठी, ગુજરાતી, ಕನ್ನಡ, മലയാളം, ਪੰਜਾਬੀ, ଓଡ଼ିଆ
- 📍 **Auto language & city detection**: user ke state ke hisaab se bhasha pehle se select hoti hai (Vercel IP headers se)
- 📋 **Report ka saar**: poori report ka short summary
- ⚠️ **Possible samasya**: abnormal values se kya issue ho sakta hai, severity (low / medium / high) ke saath
- 🧪 **Gadbad wali values**: har abnormal test ki value, normal range aur matlab
- 🥗 **Diet & lifestyle**: local aur sasta khana (kya khao, kya avoid karo, lifestyle tips)
- 👨‍⚕️ **Doctor suggestion**: top 3 specialties priority aur urgency ke saath, plus Google par nearby doctor search ka link aur NMC register verify link
- 🔊 **Audio summary**: Gemini TTS se 30-40 second ka audio; agar woh na chale to browser ki apni awaaz (fallback)
- 🛡️ **Model fallback**: ek Gemini model busy ho (503/429/404) to automatically backup model try hota hai

---

## 🛠️ Tech Stack

| Cheez | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19, plain CSS (`app/globals.css`) |
| Language | TypeScript |
| AI | `@google/genai` (Gemini) |
| Deploy | Vercel |

---

## 📁 Project Structure

```
Labmitra/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts   # Report analyze karta hai (Gemini, structured JSON output)
│   │   ├── geo/route.ts       # User ka city/state se language batata hai
│   │   └── tts/route.ts       # Audio script ko WAV audio mein badalta hai
│   ├── globals.css            # Styles
│   ├── layout.tsx             # Root layout aur metadata
│   └── page.tsx               # Main UI (upload, result cards, audio player)
├── lib/
│   └── languages.ts           # Supported languages aur state -> language mapping
├── next.config.mjs
├── package.json
└── tsconfig.json
```

---

## ⚙️ Kaise Kaam Karta Hai

1. User report upload karta hai. Images browser mein hi compress ho jaati hain (max 1800px, JPEG).
2. Frontend file ko `/api/analyze` par bhejta hai (max **4MB**, sirf image ya PDF).
3. Server file ko Gemini ko bhejta hai ek system prompt ke saath, aur ek fixed JSON schema mein jawab leta hai: summary, conditions, abnormal values, diet, doctors, audio script aur disclaimer.
4. Agar upload kiya hua file medical report nahi hai, to `isMedicalReport = false` aata hai aur short explanation dikhti hai.
5. "Suno / Play" dabane par `/api/tts` audio script ko Gemini TTS (voice: *Kore*) se WAV mein badalta hai. Fail hone par browser ki `speechSynthesis` use hoti hai.
6. Page khulte hi `/api/geo` user ke state se bhasha aur city guess karta hai (sirf Vercel par deploy hone par kaam karta hai; local mein default Hinglish rehti hai).

---

## 🚀 Local Setup

**Zaroori:** Node.js 18.18+ (Node 20 recommended) aur ek Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey) se free mein mil jaati hai).

1. Repo clone karo aur folder mein jao:
   ```bash
   git clone https://github.com/Md-Zakaullah/Labmitra.git
   cd Labmitra
   ```
2. Dependencies install karo:
   ```bash
   npm install
   ```
3. Root folder mein `.env.local` file banao:
   ```env
   GEMINI_API_KEY=apni_key_yahan_daalo
   ```
4. Dev server chalao:
   ```bash
   npm run dev
   ```
5. Browser mein kholo: [http://localhost:3000](http://localhost:3000)

### Environment Variables

| Variable | Zaroori? | Kaam |
|---|---|---|
| `GEMINI_API_KEY` | ✅ Haan | Google AI Studio ki API key |
| `GEMINI_MODEL` | ❌ Nahi | Pehle try hone wala model (default code mein set hai) |
| `GEMINI_FALLBACK_MODELS` | ❌ Nahi | Backup models, comma se alag (jaise `model-a,model-b`) |

> 🔒 `.env.local` ko kabhi GitHub par push mat karo. `.gitignore` mein yeh already ignore hai.

---

## ☁️ Vercel par Deploy

1. Code GitHub par push karo.
2. [vercel.com](https://vercel.com) par jao aur **Import Project** se repo chuno.
3. **Environment Variables** mein `GEMINI_API_KEY` daalo.
4. **Deploy** dabao.

Vercel par deploy karne se auto language/city detection bhi kaam karne lagta hai.

---

## 📜 Scripts

| Command | Kaam |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Production server chalao (build ke baad) |

---

## ⚠️ Limitations

- File size limit **4MB** hai (Vercel ke request limit ki wajah se).
- AI se galti ho sakti hai, khaaskar dhundhli photo ya haath se likhi report mein. Hamesha original report doctor ko dikhao.
- Emergency ya serious symptoms mein app par bharosa mat karo, turant doctor ke paas jao.
- Report AI service (Gemini) ko bheji jaati hai, isliye sensitive personal details dhyan se share karo.
- Audio quality aur bhasha support device/browser par depend karti hai jab fallback awaaz chalti hai.

---

## 🤝 Contribute

Suggestions aur pull requests ka swagat hai. Bug mile ya idea ho to GitHub par Issue khol do.

---

Banaya gaya ❤️ ke saath, taaki har insaan apni lab report samajh sake.
