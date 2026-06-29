import { SYSTEM_PROMPT } from "./prompt";
import { parseModelJson, looksLikeSchemaEcho } from "./jsonRepair";

// Primary: strong vision + strict JSON compliance at ~$0.10/M tokens.
// Fallback: previous model, used automatically if the primary is
// unavailable on this OpenRouter account.
const PRIMARY_MODEL = "google/gemini-2.5-flash-lite";
const FALLBACK_MODEL = "meta-llama/llama-3.2-11b-vision-instruct";

async function requestCompletion(
  apiKey: string,
  model: string,
  content: any[],
  correctiveNote?: string
): Promise<string> {
  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content },
  ];
  if (correctiveNote) {
    messages.push({ role: "user", content: correctiveNote });
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://nutriscan.app", // Optional but recommended by OpenRouter
      "X-Title": "Adisense", // Optional but recommended by OpenRouter
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error(`OpenRouter API Error (${model}):`, errorData);
    throw new Error(errorData.error?.message || `API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

export async function scanFoodLabel(
  profileText: string,
  textInput: string,
  imageInput: string | null
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OpenRouter API key is missing. Please configure it in your environment variables.");
  }

  const fullPrompt = `
Here is my current profile:
${profileText || "General Adult (No declared allergies/intolerances)"}

Please analyze the following product:
${textInput}

CRITICAL INSTRUCTION: Your entire response MUST be a single, valid JSON object matching the requested schema exactly. Replace EVERY placeholder with real values from the actual product — never copy schema examples like "Product Name" or option lists like "Easy" | "Moderate". Pick exactly ONE value for each enum field. Do not include ANY text, introduction, or markdown formatting outside of the JSON object. Return raw JSON only.
`;

  const content: any[] = [];

  if (imageInput) {
    // OpenRouter supports base64 data URLs for vision models
    content.push({
      type: "image_url",
      image_url: {
        url: imageInput,
      },
    });
  }

  content.push({
    type: "text",
    text: fullPrompt,
  });

  // Try the primary model; fall back to the legacy model if the primary is
  // not available on this account (e.g. payment/permission errors).
  let model = PRIMARY_MODEL;
  let result: string;
  try {
    result = await requestCompletion(apiKey, model, content);
  } catch (primaryError) {
    console.warn(`Adisense: ${PRIMARY_MODEL} unavailable, falling back to ${FALLBACK_MODEL}.`, primaryError);
    model = FALLBACK_MODEL;
    result = await requestCompletion(apiKey, model, content);
  }

  // Validate: weak vision models sometimes return broken JSON or parrot the
  // schema template back. Retry once with a corrective instruction.
  const parsed = parseModelJson(result);
  if (!parsed || looksLikeSchemaEcho(parsed)) {
    console.warn("Adisense: first model response invalid (unparseable or schema echo). Retrying once...");
    result = await requestCompletion(
      apiKey,
      model,
      content,
      "Your previous answer was INVALID — it either was not parseable JSON or it repeated the schema's placeholder text instead of analyzing the real product. Analyze the ACTUAL product from the image/text above. Output ONLY a valid JSON object with REAL values: real product name, real brand, real ingredients, real nutrition numbers. Choose exactly one value for every enum field. No pipes (|), no placeholders, no markdown."
    );
  }

  return result;
}
