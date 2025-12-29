# DAO Frontend

Simple Vite + React client for the DAO lab tasks. It connects to the Hoodi test network via wagmi, handles Web3 auth (nonce signing) against the backend, and shows wallet/token balances once authenticated.

## Getting Started

1. Install deps: `npm install`.
2. Copy `.env.example` to `.env` and fill:
   - `VITE_PROJECT_ID` – Reown project id.
   - `VITE_ALCHEMY_KEY` – Hoodi RPC key.
   - `VITE_API_URL` – backend URL for auth (e.g. `http://localhost:3000`).
   - `VITE_DAO_ADDRESS` – DAO contract address on Hoodi.
   - optional `VITE_CUSTOM_TOKEN_ADDRESS`.
   - optional `VITE_VOTE_DURATION_SECONDS` – seconds before execution buttons appear (0 = immediate).
3. Run `npm run dev` for local development.

## Available Scripts

- `npm run dev` – Vite dev server with HMR.
- `npm run build` – type-check + production build.
- `npm run preview` – serve the built app.
- `npm run lint` – run ESLint over the repo.

## Features

- Wallet connect/disconnect + network switching.
- Dapp auth: fetch nonce, sign with wallet, verify via backend (axios).
- Balance panel for native + user-added ERC-20 tokens (persisted in `localStorage`).
- Guarded layout to hide dapp content until auth succeeds and reset on disconnect.
