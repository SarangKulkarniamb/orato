# Deploy Orato

This repo is set up for:

- Backend: Render Web Service
- Frontend: Vercel

Important:

- Render web services support WebSockets and expect your app to bind to `0.0.0.0` on `PORT`.
- Render free-tier filesystems are ephemeral. In this app, uploaded PDFs and Chroma vector data can be lost after a restart or redeploy.
- The checked-in `.env` files appear to contain real secrets. Rotate them before deploying.

Official docs used:

- Render Web Services: https://render.com/docs/web-services
- Render WebSockets: https://render.com/docs/websocket
- Render Persistent Disks: https://render.com/docs/disks
- Render Blueprint spec: https://render.com/docs/blueprint-spec
- Vite on Vercel: https://vercel.com/docs/frameworks/frontend/vite
- Vercel rewrites: https://vercel.com/docs/rewrites

## 1. Before You Deploy

1. Push this repo to GitHub.
2. Rotate any secrets currently stored in:
   - `orato-be/.env`
   - `orato-fe/.env`
3. Keep your real secrets only in Render and Vercel project settings.

## 2. Backend on Render

You can deploy either with `render.yaml` or manually in the dashboard.

### Option A: Render Blueprint

1. In Render, click `New` -> `Blueprint`.
2. Connect the GitHub repo.
3. Render will detect `render.yaml`.
4. Create the service.
5. Fill in the missing secret env vars in the Render dashboard.

### Option B: Manual Render Web Service

Use these settings:

- Runtime: `Python 3`
- Root Directory: `orato-be`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health Check Path: `/`
- Plan: `Free`

### Render environment variables

Set these in Render:

- `MONGODB_URL` = your Mongo Atlas connection string
- `SECRET_KEY` = a long random secret
- `ALGORITHM` = `HS256`
- `ACCESS_TOKEN_EXPIRE_MINUTES` = `10800`
- `GEMINI_API_KEY` = your Gemini key
- `LLM_REASONING_ENABLED` = `true`
- `LLM_PROVIDER` = `gemini`
- `GEMINI_MODEL` = `gemini-2.5-flash`
- `GEMINI_REASONING_EFFORT` = `low`
- `GEMINI_BASE_URL` = `https://generativelanguage.googleapis.com/v1beta/openai`
- `LLM_TIMEOUT_SECONDS` = `8`
- `GOOGLE_SEARCH_API_KEY` = optional, only if you want Google Custom Search
- `GOOGLE_SEARCH_CX` = optional, only if you want Google Custom Search
- `CORS_ORIGINS` = `http://localhost:5173,https://your-frontend.vercel.app`

For Google Speech credentials, this repo now supports either:

- `GOOGLE_CREDENTIALS_JSON_BASE64`
- or `GOOGLE_CREDENTIALS_JSON`

PowerShell helper to generate the Base64 value from your service account JSON:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("D:\path\to\cred.json"))
```

Paste that output into `GOOGLE_CREDENTIALS_JSON_BASE64` on Render.

If you also want Vercel preview deployments to work against the backend, add:

- `CORS_ORIGIN_REGEX` = `https://.*\.vercel\.app`

### After Render deploys

1. Open your backend URL, for example `https://your-backend.onrender.com/`
2. Confirm you get:

```json
{"status":"ok","message":"Orato Backend is Running!"}
```

3. Save the backend base URL. You will need it for Vercel as `VITE_API_URL`.

## 3. Frontend on Vercel

This frontend is a Vite SPA, and `orato-fe/vercel.json` already includes the rewrite needed for React Router deep links.

### Vercel dashboard setup

1. In Vercel, click `Add New...` -> `Project`.
2. Import the same GitHub repo.
3. Set `Root Directory` to `orato-fe`.
4. Framework preset should detect as `Vite`.
5. Add environment variable:

- `VITE_API_URL` = your Render backend URL

Example:

```text
https://your-backend.onrender.com
```

6. Deploy.

### After Vercel deploys

1. Open the Vercel site.
2. Confirm login, upload, API calls, and WebSocket features work.
3. Copy the production Vercel URL and add it to Render `CORS_ORIGINS` if not already present.
4. Trigger a manual redeploy on Render after changing CORS values.

## 4. Known Free-Tier Limitation

On Render free tier:

- files under `uploads/` are not durable
- files under `db/chroma/` are not durable

That means uploaded documents and generated vector DBs may disappear after a restart, inactivity spin-down, or redeploy.

If you want durable storage later, move to one of these:

- Render paid web service + persistent disk
- object storage for uploaded files plus an external vector database

## 5. Fastest Deploy Order

1. Push repo to GitHub.
2. Deploy backend to Render.
3. Copy Render URL.
4. Deploy frontend to Vercel with `VITE_API_URL`.
5. Add final Vercel URL to Render `CORS_ORIGINS`.
6. Redeploy Render once.
