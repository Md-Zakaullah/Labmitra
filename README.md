# LabMitra

Lab report upload karo, apni bhasha mein samjho. Next.js + Google AI Studio (Gemini).

## Chalane ke steps
1. `npm install`
2. `.env.example` ko copy karke `.env.local` banao aur `GEMINI_API_KEY=` ke aage apni key daalo
3. `npm run dev` -> http://localhost:3000

## Vercel deploy
GitHub pe push karo -> vercel.com -> Import repo -> Environment Variables mein `GEMINI_API_KEY` daalo -> Deploy.

## Medical Information Assistant (starter implementation)

A separate Medical Chatbot is available alongside the existing Lab Report Analyzer.
It uses server-side local reference libraries (`lib/medical-knowledge.json` and
`lib/disease-library.json`), lightweight keyword retrieval, and the existing Gemini API key.
The API route is `app/api/medical-chat/route.ts`.

**Clinical safety:** workbook and starter summaries are marked `educational_unreviewed`;
they are not clinically verified. Basic emergency keyword checks are not comprehensive
triage. This chatbot is educational only and does not diagnose, prescribe, or provide
drug dosages. Have qualified clinicians review content before production use.

The existing analyzer route and UI flow have been retained. Run `npm install`,
then `npm run build` and test both modes before deployment.
