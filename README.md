# Inspection Reports (Frontend Prototype)

A small React + TypeScript prototype that searches inspection reports by IMO and shows full report details.

Quick start:

1. cd inspection-reports-web
2. npm install
3. copy `.env.example` to `.env` and set `VITE_API_BASE` to your API sandbox or `http://localhost:3000` for local mock
4. npm run dev

Local mock server (optional):

1. npm run mock:server  # starts a small Express server serving `data/sample_reports.json` on http://localhost:3000
2. Keep `VITE_API_BASE=http://localhost:3000` in `.env` and use the frontend as normal

Notes:
- The app expects an API matching the contract in the parent project README (GET /reports?imo=..., GET /reports/:reportId).
- You can use the included `data/sample_reports.json` as a reference for the expected schema.

Testing:
- Unit tests use Vitest + Testing Library.
- Run `npm test` to run unit tests.
- CI: a GitHub Actions workflow runs unit tests and builds on push/PR to `main`.
