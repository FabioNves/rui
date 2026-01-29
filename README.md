RUI — Research Understanding Intelligence

AI-assisted critical analysis workflow for research papers. Paste a DOI and/or upload a PDF, generate:

- Structured analysis (RQ, methods, findings, contributions, limitations, future work)
- Optional related work list (manual add or Mendeley search)
- Comparative analysis (main vs related)
- Final critical analysis report (recommended or custom structure)
- PDF export (client-side)

## Getting Started

## Getting started

1. Create a local env file:

- Copy `.env.example` → `.env.local`
- Fill in `OPENAI_API_KEY` and/or `GEMINI_API_KEY`
- (Optional) Fill in Mendeley credentials if you want in-app related work search

2. Run the dev server (configured for port 8080 to match the Mendeley redirect URI):

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open http://localhost:8080

Notes:

- No authentication and no database: everything is stored in `localStorage`.
- AI calls happen server-side via Next.js route handlers, so keys stay in `.env.local`.
- Mendeley is optional and uses OAuth; click “Connect Mendeley (optional)” in the UI.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Deployment

This can be deployed like any Next.js app. For small-group sharing, you can run it on a single machine and share the URL via your network.
