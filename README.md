# Adisense + NutriVision (Combined)

A single application that merges two projects into one Bio2-style UI:

- **Adisense (Bio2)** — the base UI and its two original experiences:
  - **Label Scanner** — upload/paste a food label, get an AI safety report (OpenRouter).
  - **Interaction Lab** — study additive combinations and their risk profile.
- **NutriVision (Bio1)** — added as a third mode:
  - **Meal Analysis** — upload a meal photo, run local YOLOv8 detection, and get
    calories, macros, food-safety insight, and personalized recommendations.

The header mode switcher toggles between **Label Scanner**, **Interaction Lab**,
and **Meal Analysis**. Theme, landing page, and overall design are unchanged from
Adisense; the NutriVision feature was rebuilt with the same design tokens and
shadcn components so it looks native.

## Architecture

```
combined/
  src/
    App.tsx                      # adds the "meal" mode to the Adisense shell
    components/
      MealAnalysis.tsx           # NutriVision UI, restyled to the Adisense look
      AddiSafeDashboard.tsx      # (Adisense) Interaction Lab
      ...                        # other Adisense components
    lib/
      nutrivisionApi.ts          # talks to the Flask backend via /nutri-api
      openrouter.ts, additives.ts, ...   # Adisense libs
  server.js                      # (optional) Adisense Express gateway  -> port 8787
  backend/                       # NutriVision Flask backend            -> port 5000
    app.py, routes/, services/, models/best.pt, data/nutrition.json
  vite.config.ts                 # proxies /nutri-api -> Flask, /api -> gateway
```

### Request routing

The Vite dev server (port **3000**) proxies:

- `/nutri-api/*` → `http://127.0.0.1:5000/api/*`  (NutriVision Flask backend)
- `/api/*` → `http://localhost:8787/*`  (Adisense gateway, optional)

This keeps the two backends from colliding on the `/api` namespace.

## Running it

You need up to three processes. The frontend is required; the Flask backend is
required for **Meal Analysis**; the gateway is optional (the Interaction Lab falls
back to direct upstream calls when it is offline).

### 1. Frontend (required)

```bash
npm install
npm run dev          # http://localhost:3000
```

Set `OPENROUTER_API_KEY` in a `.env` file (see `.env.example`) for the Label Scanner.

### 2. NutriVision Flask backend (required for Meal Analysis)

```bash
cd backend
pip install -r requirements.txt
python app.py        # http://localhost:5000
```

The backend runs local Ultralytics YOLOv8 inference with `backend/models/best.pt`
and maps detections to `backend/data/nutrition.json`. For the optional Gemini
Vision food-safety panel, set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in the
backend environment; without it the rest of the analysis still works.

### 3. Adisense gateway (optional)

```bash
npm run server       # http://localhost:8787
```

Caches and proxies PubChem / OpenFDA / Open Food Facts calls for the Interaction Lab.

## Notes

- The combined frontend uses `fetch` for the NutriVision calls, so no extra
  dependency was added on top of the Adisense package set.
- The Flask `CORS_ORIGIN` is set to `http://localhost:3000` to match the dev
  server. In normal use requests go through the Vite proxy, so CORS is not hit.
- Meal history persists in `localStorage` under `nutrivisionMealHistory`; health
  profiles for the Label Scanner persist under `healthProfiles`.
