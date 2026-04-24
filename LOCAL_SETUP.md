# Run Orato Locally

This guide explains how to run the current version of this project on your local machine.

Project structure:

- Backend: [orato-be](D:/personal/projects/isa/orato-be)
- Frontend: [orato-fe](D:/personal/projects/isa/orato-fe)

## 1. Prerequisites

Install these first:

- Python `3.11.x`
- Node.js `20.x` or newer
- npm
- A MongoDB database

Recommended:

- MongoDB Atlas for the fastest setup
- A Google Cloud service account JSON file if you want speech-to-text
- A Gemini API key if you want LLM reasoning and lecture summaries

## 2. Clone And Open The Repo

```powershell
cd D:\personal\projects
git clone <your-repo-url> isa
cd isa
```

## 3. Backend Setup

### 3.1 Create a virtual environment

```powershell
cd D:\personal\projects\isa\orato-be
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If `py -3.11` is unavailable, use your local Python 3.11 executable instead.

### 3.2 Create backend env file

Copy [orato-be/.env.example](D:/personal/projects/isa/orato-be/.env.example) to `orato-be/.env`.

Example:

```powershell
Copy-Item .env.example .env
```

Then fill in the values.

### 3.3 Backend environment variables

Required for basic local login/upload/API usage:

- `MONGODB_URL`
  Mongo connection string.
  Example: `mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority`
- `SECRET_KEY`
  Long random string used to sign JWTs.
- `ALGORITHM`
  Usually `HS256`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
  Token lifetime in minutes. Current default in examples is `10800`.

Recommended for local frontend access:

- `CORS_ORIGINS`
  Comma-separated list of allowed frontend origins.
  Local example: `http://localhost:5173,http://127.0.0.1:5173`

Optional LLM-related variables:

- `LLM_REASONING_ENABLED`
  `true` or `false`
- `LLM_PROVIDER`
  Current deployed default is `gemini`
- `GEMINI_API_KEY`
  Needed if you want Gemini-based reasoning/summaries
- `GEMINI_MODEL`
  Current example: `gemini-2.5-flash`
- `GEMINI_REASONING_EFFORT`
  Current example: `low`
- `GEMINI_BASE_URL`
  Current example: `https://generativelanguage.googleapis.com/v1beta/openai`
- `LLM_TIMEOUT_SECONDS`
  Current example: `8`

Optional Google Speech credentials:

You can use either of these approaches:

- `GOOGLE_APPLICATION_CREDENTIALS`
  Absolute or relative path to your Google service account JSON file
- `GOOGLE_CREDENTIALS_JSON`
  Raw JSON content as a string
- `GOOGLE_CREDENTIALS_JSON_BASE64`
  Base64-encoded JSON content

Optional web search variables:

- `GOOGLE_SEARCH_API_KEY`
- `GOOGLE_SEARCH_CX`

Optional compatibility variables accepted by the current code:

- `MONGO_URI`
  Alternative to `MONGODB_URL`
- `JWT_SECRET_KEY`
  Alternative to `SECRET_KEY`
- `JWT_ALGORITHM`
  Alternative to `ALGORITHM`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `LLM_BASE_URL`
- `CORS_ORIGIN_REGEX`

Legacy note:

- The repo may still contain old secrets in checked-in `.env` files. Do not reuse them. Create fresh values locally.
- You may notice `CHROMA_DIR` in the current backend settings file. That is a leftover setting and is not needed for normal local setup.

### 3.4 Example backend `.env`

Use this as a safe template:

```env
MONGODB_URL=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority
SECRET_KEY=replace-with-a-long-random-secret
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10800

LLM_REASONING_ENABLED=true
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_REASONING_EFFORT=low
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_TIMEOUT_SECONDS=8

GOOGLE_CREDENTIALS_JSON_BASE64=
GOOGLE_SEARCH_API_KEY=
GOOGLE_SEARCH_CX=

CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

If you want to use a file path instead of Base64 for Google credentials:

```env
GOOGLE_APPLICATION_CREDENTIALS=D:\path\to\service-account.json
```

### 3.5 Start the backend

```powershell
cd D:\personal\projects\isa\orato-be
.\.venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend health check:

- Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- You should get:

```json
{"status":"ok","message":"Orato Backend is Running!"}
```

## 4. Frontend Setup

### 4.1 Install frontend dependencies

```powershell
cd D:\personal\projects\isa\orato-fe
npm install
```

### 4.2 Create frontend env file

Copy [orato-fe/.env.example](D:/personal/projects/isa/orato-fe/.env.example) to `orato-fe/.env`.

```powershell
Copy-Item .env.example .env
```

### 4.3 Frontend environment variables

Required:

- `VITE_API_URL`
  Backend base URL.
  Local value:
  `http://127.0.0.1:8000`

Legacy note:

- You may see `VITE_DEEPGRAM_KEY` in the existing checked-in frontend `.env`.
- In the current frontend code, that variable is not read anywhere.
- You do not need it for the current local setup.

### 4.4 Example frontend `.env`

```env
VITE_API_URL=http://127.0.0.1:8000
```

### 4.5 Start the frontend

```powershell
cd D:\personal\projects\isa\orato-fe
npm run dev
```

Default frontend URL:

- [http://localhost:5173/](http://localhost:5173/)

## 5. Run The Full App

You need both services running:

1. Start the backend on port `8000`
2. Start the frontend on port `5173`
3. Open the frontend in the browser
4. Sign up or sign in
5. Upload a PDF
6. Open a presentation

## 6. Features And Which Env Vars They Need

Basic app flow:

- Needs: `MONGODB_URL`, `SECRET_KEY`, `ALGORITHM`, `VITE_API_URL`

Voice transcription with Google Speech:

- Needs one of:
  `GOOGLE_APPLICATION_CREDENTIALS`
  or `GOOGLE_CREDENTIALS_JSON`
  or `GOOGLE_CREDENTIALS_JSON_BASE64`

LLM-based command reasoning and lecture summary:

- Needs:
  `LLM_REASONING_ENABLED=true`
  and a working Gemini/OpenAI-compatible key
- Most common setup:
  `GEMINI_API_KEY`, `LLM_PROVIDER=gemini`

Google Custom Search:

- Needs:
  `GOOGLE_SEARCH_API_KEY`
  and `GOOGLE_SEARCH_CX`
- Without them, the app may fall back to the alternate search flow implemented in the backend.

## 7. Troubleshooting

### Backend starts but login/upload fails

Check:

- `MONGODB_URL` is valid
- MongoDB user has access
- backend terminal shows no database connection errors

### Frontend loads but API calls fail

Check:

- `VITE_API_URL` points to the running backend
- backend is reachable at `http://127.0.0.1:8000`
- `CORS_ORIGINS` includes `http://localhost:5173`

### Voice features do not work

Check:

- Google credentials are configured
- your browser microphone permission is granted
- backend logs do not show Google auth errors

### WebSocket issues in presentation mode

Check:

- backend is running on `http://127.0.0.1:8000`
- frontend `VITE_API_URL` matches that backend
- JWT login succeeded before opening the presentation page

### Dependency installation is very heavy

The current backend requirements are large. First install can take time. If installation fails:

- confirm you are on Python `3.11`
- upgrade `pip`
- retry inside a clean virtual environment

## 8. Handy Commands

Backend:

```powershell
cd D:\personal\projects\isa\orato-be
.\.venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Frontend:

```powershell
cd D:\personal\projects\isa\orato-fe
npm run dev
```

## 9. Current Local URLs

- Frontend: [http://localhost:5173/](http://localhost:5173/)
- Backend: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)

