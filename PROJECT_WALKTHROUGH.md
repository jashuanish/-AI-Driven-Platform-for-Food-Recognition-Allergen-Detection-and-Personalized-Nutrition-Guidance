# Adisense Project Walkthrough

This file explains how the project works from startup to scan analysis, including the frontend, backend gateway, AI prompt flow, additive lab, and build process.

## 1. What This App Is

Adisense is a React + Vite food-label intelligence app. It has two main experiences:

1. The scanner, where a user uploads a food label image or pastes label text and gets a structured AI report.
2. The interaction lab, where the user studies combinations of additives and their risk profile.

The app is designed around one core idea: take either a label image or label text, turn it into structured data, enrich it with local additive knowledge and live public data, then present the result in a visual dashboard.

---

## 2. The Main Files and What They Do

1. `src/main.tsx` mounts the React app into the page.
2. `src/App.tsx` is the main UI and the top-level flow controller.
3. `src/lib/openrouter.ts` sends scan requests to OpenRouter and returns the AI response.
4. `src/lib/prompt.ts` contains the system prompt that tells the AI exactly how to behave and what JSON to return.
5. `src/lib/jsonRepair.ts` repairs messy model output and detects schema echoes.
6. `src/lib/additives.ts` stores the local additive knowledge base and interaction rules.
7. `src/lib/additiveEngine.ts` combines local knowledge with PubChem and OpenFDA data for the additive lab.
8. `src/components/AddiSafeDashboard.tsx` renders the interaction lab.
9. `src/components/BarcodeScanner.tsx` handles barcode scanning.
10. `server.js` runs the optional Express gateway that caches and proxies external API calls.

---

## 3. Startup Flow

### Step 1: Browser loads the app

When the browser opens the site, `index.html` loads `src/main.tsx`.

### Step 2: React mounts the app

`src/main.tsx` imports `App` and renders it into the root DOM element.

The order is simple:

1. React.StrictMode wraps the app.
2. `App` is rendered.
3. Global CSS from `src/index.css` is loaded.

### Step 3: Global theme and layout styles apply

`src/index.css` defines the Tailwind theme tokens used everywhere:

1. Background and foreground colors.
2. Primary, secondary, muted, accent, border, and ring colors.
3. Light mode tokens.
4. Dark mode tokens.

This file controls the overall visual language of the app.

### Step 4: `App` initializes state

Inside `src/App.tsx`, the app sets up its main state:

1. `view` decides whether the user sees the landing page or the main app.
2. `mode` decides whether the user is in scanner mode or lab mode.
3. `profiles` stores allergy and restriction profiles.
4. `activeProfileId` tracks which profile is selected.
5. `imageInput` stores the uploaded label image as a base64 string.
6. `textInput` stores pasted label text.
7. `isScanning` shows whether the AI request is running.
8. `result` stores the raw JSON string returned by the model.
9. `error` stores any scan error message.
10. `theme` toggles between light and dark mode.

The app also restores saved profiles from `localStorage` and saves updates back into `localStorage` automatically.

---

## 4. Landing Page Flow

If `view === "landing"`, the app renders `LandingPage`.

### What the landing page does

1. Shows the Adisense logo and name.
2. Presents the main tagline.
3. Shows a short feature summary.
4. Provides a `Get Started` button.

### What happens when the user clicks Get Started

`onGetStarted` changes `view` from `landing` to `app`.

After that, the main scanner interface appears.

---

## 5. Main App Layout

Once the landing page is bypassed, `App` renders the main shell.

The top header contains:

1. A small brand badge.
2. The Adisense logo.
3. A mode switcher for `Label Scanner` and `Interaction Lab`.
4. A theme toggle button.

The main content area changes based on `mode`:

1. In scanner mode, the app shows profile setup, label input, and the report output.
2. In lab mode, the app shows `AddiSafeDashboard`.

---

## 6. Health Profile System

The health profile system is the user-specific filter that personalizes scan results.

### Step 1: User creates or selects a profile

The UI allows multiple profiles. Each profile has:

1. An `id`.
2. A name.
3. A list of selected allergy or restriction IDs.

### Step 2: User checks categories

The categories are split into groups:

1. Critical allergens.
2. Intolerances.
3. Dietary restrictions.
4. Health conditions.

### Step 3: Profile data becomes scan context

When the user scans a product, the selected labels are converted into a single profile string.

That string is passed into the AI prompt so the model knows what to flag.

### Step 4: Profiles persist locally

Profiles are saved in `localStorage`, so refreshes do not erase the user’s setup.

---

## 7. Product Input Flow

The user can provide product data in two ways:

1. Upload a label image.
2. Paste or type label text.

### Image path

`handleImageUpload` uses a `FileReader` to turn the image into a base64 data URL.

That string is stored in `imageInput`.

### Text path

The user types into the textarea and the value is stored in `textInput`.

### Why both exist

The model can analyze either:

1. A visual label image.
2. A transcript of ingredients and nutrition facts.

If both are present, both are sent.

---

## 8. Scan Button Flow

The scan starts in `handleScan`.

### Step 1: Input validation

The function first checks whether the user supplied either:

1. An uploaded image, or
2. Some text input.

If neither exists, it sets an error and stops.

### Step 2: Loading state starts

If input exists, the app sets:

1. `isScanning = true`
2. `error = null`
3. `result = null`

This clears any previous result and shows the scanner overlay.

### Step 3: Profile string is built

The selected profile IDs are mapped to their labels and joined into a readable string.

If no profile is selected, the app uses `General Adult`.

### Step 4: The scan request is sent

The app calls `scanFoodLabel(profileStr, textInput, imageInput)`.

### Step 5: Success or failure is stored

If the request succeeds, the raw JSON string is placed into `result`.

If it fails, the error message is placed into `error`.

### Step 6: Loading state ends

`isScanning` is set back to `false` in the `finally` block.

---

## 9. AI Request Flow

`src/lib/openrouter.ts` is the AI transport layer.

### Step 1: Read the API key

`scanFoodLabel` reads `process.env.OPENROUTER_API_KEY`.

If it is missing, the function throws immediately.

### Step 2: Build the full prompt

The function creates a prompt containing:

1. The user profile.
2. The product text.
3. A strict instruction to return only valid JSON.

### Step 3: Package the content array

The request content is built as a multimodal message payload:

1. If an image exists, it is sent as an `image_url` item.
2. The text prompt is always added.

### Step 4: Send to OpenRouter

`requestCompletion` sends the message list to the OpenRouter chat completions endpoint.

The request includes:

1. `Authorization: Bearer <key>`.
2. `HTTP-Referer`.
3. `X-Title: Adisense`.

### Step 5: Primary model first

The app tries the primary vision model first.

If that fails, it automatically falls back to the backup model.

### Step 6: Response validation

The returned string is passed through `parseModelJson`.

If the output is malformed or looks like a schema echo, the app retries once with a corrective message.

### Step 7: Final raw result returned

The final string is returned to `App` and later parsed again for UI rendering.

---

## 10. Prompt Design

`src/lib/prompt.ts` controls how the AI thinks and what it must output.

This prompt is the most important part of the scan pipeline.

### It tells the model:

1. What Adisense is.
2. What kinds of inputs it can receive.
3. How to handle unreadable image regions.
4. How to interpret user allergy profiles.
5. Which allergens and aliases to treat as critical.
6. How to extract additives only when they are explicitly printed.
7. Exactly what JSON shape to return.

### Why this matters

The UI depends on structured JSON.

If the model returns prose instead of JSON, the app cannot render the report cleanly.

The prompt is therefore written to reduce ambiguity and force machine-readable output.

---

## 11. JSON Repair Flow

AI output is often messy, so `src/lib/jsonRepair.ts` makes it usable.

### Step 1: Trim and clean

The code removes extra markdown fences and extracts the first JSON object region.

### Step 2: First parse attempt

It tries `JSON.parse` on the raw candidate text.

### Step 3: Repair attempt

If parsing fails, it fixes common problems:

1. Smart quotes.
2. Trailing commas.
3. Union examples like `"Easy" | "Moderate" | "Lifestyle change"`.

### Step 4: Truncated object repair

If the response was cut off mid-object, the file closes unbalanced quotes, braces, and brackets.

### Step 5: Schema echo detection

The function `looksLikeSchemaEcho` checks whether the model copied placeholder values from the schema instead of analyzing the product.

If enough placeholders are found, the result is treated as invalid.

### Why this exists

It lets the app recover from weak or partially broken model output without crashing the user flow.

---

## 12. Parsing the Final Report

Once `result` exists, `App` converts it into a structured object.

### Step 1: Memoized parsing

`useMemo` calls `parseModelJson<ReportData>(result)`.

### Step 2: If parsing fails

The app logs the failure and keeps the raw string available for fallback display.

### Step 3: Structured rendering begins

If parsing succeeds, the report UI receives a typed object with sections such as:

1. `allergySafety`
2. `snapshot`
3. `ingredients`
4. `nutrition`
5. `healthScore`
6. `healthFlags`
7. `alternatives`
8. `diyAlternative`
9. `bottomLine`

---

## 13. How The Report Is Rendered

The report is divided into cards.

### Step 1: Stop banner

If the AI returned a stop banner, the app shows a full-width red warning at the top.

### Step 2: Interaction report

If additives were detected, the app renders `InteractionReport`.

This explains additive combinations and can send them to the lab.

### Step 3: Health score

The health score card shows:

1. The adjusted score.
2. A short verdict.
3. A bar chart of score dimensions.

The adjusted score subtracts an interaction penalty when dangerous additive combinations are present.

### Step 4: Product snapshot

This card summarizes brand, product name, variant, serving size, and demographic.

### Step 5: Allergy safety

This card lists every allergy or intolerance finding with severity and reason.

### Step 6: Nutrition overview

Each nutrient is shown with its per-serving value, RDI, and a status dot.

### Step 7: Ingredient deep dive

Each ingredient gets:

1. A name.
2. A functional description.
3. A safety status.
4. A note.
5. An allergen flag if relevant.

### Step 8: Healthier swaps

Alternative products are shown with explanations and allergen notes.

### Step 9: DIY alternative

If the AI suggests a homemade replacement, it is shown in a dedicated panel.

### Step 10: Medical flags

Warnings for specific conditions are shown in a separate card.

### Step 11: Bottom line

The report ends with a single summary statement.

---

## 14. Additive Detection Logic

After the JSON is parsed, the app runs local additive analysis.

### Step 1: Read explicit additive list

`parsedResult.additivesDetected` is checked first.

Each item is matched by E-code or by additive name.

### Step 2: Scan ingredient names

The app also runs `detectAdditives` across every ingredient name.

### Step 3: Merge and deduplicate

Additives are stored in a `Map` so the same additive is not counted twice.

### Step 4: Build the detected list

The final additive list is used for:

1. Interaction reporting.
2. Lab mode auto-loading.
3. Risk penalty calculation.

---

## 15. Interaction Penalty Logic

The app does not rely only on the AI score.

It also reduces the score when additive combinations are risky.

### Step 1: Compute interaction risk

`computeRisk` runs on the detected additives.

### Step 2: Count dangerous and moderate pairs

The number of dangerous and moderate pairs is counted.

### Step 3: Apply penalty

The final health score is reduced by:

1. 15 points per dangerous pair.
2. 5 points per moderate pair.

### Step 4: Clamp the final result

The score stays within 0 to 100.

This prevents a product with several risky additive combinations from still appearing overly safe.

---

## 16. Interaction Lab Flow

The interaction lab is powered by `src/components/AddiSafeDashboard.tsx`.

### Step 1: User adds additives

The user can:

1. Type additive names or E-codes.
2. Click quick-add chips.
3. Scan a barcode.

### Step 2: Local additive lookup runs

The selected additive IDs are resolved against the local additive knowledge base.

### Step 3: Risk score is calculated locally

The dashboard computes a local risk score and confidence band.

### Step 4: Live enrichment starts

`analyzeAdditives` is called with the selected additive names.

### Step 5: Graph and interaction list render

The dashboard shows a network graph and the interaction list.

### Step 6: Barcode scan can auto-fill the lab

If a barcode is scanned, detected additives are pushed into the cocktail list.

---

## 17. Additive Engine Flow

`src/lib/additiveEngine.ts` is the live analysis engine behind the lab.

### Step 1: Resolve each additive

For each additive name, the engine tries to resolve:

1. A local additive match.
2. A PubChem compound.
3. An OpenFDA adverse event count.

### Step 2: Use the gateway when available

Before hitting public APIs directly, the engine checks whether the local gateway is up.

If the gateway is available, requests route through `/api/proxy/*`.

### Step 3: Compute confidence

The engine assigns source weights:

1. PubChem.
2. OpenFDA.
3. Local KB.

The confidence score is the weighted average of the sources that resolved.

### Step 4: Evaluate interactions

The engine compares the selected additive IDs against the local interaction list.

### Step 5: Compute risk score

The final risk score uses:

1. The highest base risk among the selected additives.
2. A multiplier for dangerous and moderate interaction pairs.

### Step 6: Return a full analysis object

The output includes:

1. Individual resolutions.
2. Interactions.
3. Final risk score.
4. Base risk.
5. Confidence band.
6. Counts of dangerous and moderate interactions.

---

## 18. Barcode Scanner Flow

The barcode scanner is used inside the interaction lab.

### Step 1: User opens the scanner

The scanner overlay appears.

### Step 2: Barcode is read

The scanner returns barcode data and product metadata.

### Step 3: Open Food Facts is queried

The product is looked up using the barcode.

### Step 4: Additives are extracted

The scanner returns known additives from the product.

### Step 5: Lab list updates

Any matched additives are added to the lab cocktail.

---

## 19. Express Gateway Flow

`server.js` is an optional local API gateway.

### What the gateway does

1. Adds CORS-safe API access for the frontend.
2. Caches responses.
3. Rate-limits requests.
4. Proxies public API calls.

### How it starts

The server reads environment variables, then starts on port `8787` by default.

### Gateway endpoints

1. `/api/health` reports gateway status.
2. `/api/proxy/pubchem/:name` proxies PubChem.
3. `/api/proxy/openfda/:name` proxies OpenFDA.
4. `/api/proxy/off/:barcode` proxies Open Food Facts.

### Cache behavior

The server tries Redis first.

If Redis is unavailable, it falls back to an in-memory TTL cache.

### Why the gateway exists

It reduces repeated upstream calls and keeps the UI responsive even when external sources are slow.

---

## 20. Theme Switching

The app supports light and dark mode.

### Step 1: Theme state changes

Clicking the theme button flips `theme` between `light` and `dark`.

### Step 2: HTML root class updates

The app adds or removes the `dark` class on `document.documentElement`.

### Step 3: CSS variables switch

Because the CSS theme is variable-driven, the whole UI updates automatically.

### Step 4: Dark mode remains black

The dark theme is intentionally neutral black/charcoal.

Only the light theme carries the green logo-aligned color story.

---

## 21. Build Flow

The project uses Vite.

### Development

Run:

```bash
npm run dev
```

This starts the frontend on port `3000`.

### Production build

Run:

```bash
npm run build
```

This generates the `dist` folder.

### Preview

Run:

```bash
npm run preview
```

This serves the production build locally.

### Typecheck

Run:

```bash
npm run lint
```

This runs TypeScript checks without emitting output.

---

## 22. End-to-End User Journey

Here is the full runtime path in order:

1. The browser opens the app.
2. `main.tsx` mounts `App`.
3. `App` shows the landing page.
4. The user clicks `Get Started`.
5. The main dashboard appears.
6. The user sets allergy and restriction profiles.
7. The user uploads a label image or pastes text.
8. The user clicks `Run Security Scan`.
9. `handleScan` validates input.
10. `scanFoodLabel` sends the prompt and image/text to OpenRouter.
11. The AI returns JSON.
12. `jsonRepair.ts` cleans or repairs the output if needed.
13. `App` parses the JSON into a report object.
14. The UI renders the report cards.
15. Local additive extraction runs.
16. Interaction penalties adjust the score.
17. If additive data exists, it can be sent to the lab.
18. In lab mode, the additive engine fetches local and live data.
19. The Express gateway proxies and caches upstream requests when available.
20. The user reads a complete structured safety report.

---

## 23. In Plain English

If you want the simplest explanation:

1. The UI collects a label image or text.
2. The prompt tells the AI exactly how to analyze it.
3. The AI returns structured JSON.
4. The app repairs and parses that JSON.
5. The report is rendered into cards.
6. Additives are cross-checked against local and live data.
7. The additive lab gives a second layer of analysis.
8. The backend gateway caches expensive lookups.

That is the whole system.