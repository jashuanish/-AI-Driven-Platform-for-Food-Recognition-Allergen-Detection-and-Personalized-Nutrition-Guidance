import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from PIL import Image, UnidentifiedImageError


ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
ENV_LOADED = load_dotenv(ENV_PATH) or load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
SDK_NAME = "google-genai"
HEALTH_CACHE_SECONDS = 120
_health_cache = {"timestamp": 0, "data": None}


PROMPT = """
Analyze this meal image as a food quality and food-safety assistant.
Return only JSON with keys:
freshness, freshnessConfidence, foodSafety, cookingStyle, oilLevel,
portionEstimate, visualInsights, qualitySummary, geminiConfidence.
freshnessConfidence and geminiConfidence must be numbers from 0 to 1.
Use cautious language. Do not claim food is definitely safe or definitely spoiled.
"""


IDENTIFY_PROMPT_TEMPLATE = """
You are a food identification expert. Look at the image and respond with ONLY valid JSON.

A local detection model proposed these candidate labels for this image: {candidates}
If the list is empty, the local model did not recognize anything.

Return a JSON object with these exact keys:
- "isFood": true if the image mainly shows an edible food or drink, false otherwise.
- "notFoodReason": if isFood is false, one short user-facing sentence naming what the image
  actually shows (e.g. "This looks like a mobile phone, not a food item."). Empty string when isFood is true.
- "items": an array of the foods you can identify, each as {{"name": "<concise food name>", "confidence": <number 0 to 1>}}.
  Use an empty array when isFood is false.
- "modelVerdicts": an object mapping EACH candidate label to
  {{"matches": <true|false>, "confidence": <number 0 to 1>, "correctedName": "<correct name if it does not match, else empty>"}}.
  Use an empty object when there were no candidates.

Rules:
- Judge each candidate label strictly: "matches" is true only when that label is a correct name for the food actually shown.
- Keep names specific but concise (e.g. "Idli", "Masala Dosa", "Apple").
- "confidence" reflects how sure you are.
Return only the JSON object. No markdown code fences, no commentary.
"""


COMBINED_PROMPT_TEMPLATE = """
You are a food identification, quality and food-safety assistant. Look at the image and respond with
ONLY valid JSON (no markdown code fences, no commentary).

A local detection model proposed these candidate labels for this image: {candidates}
If the list is empty, the local model did not recognize anything.

Return a single JSON object containing ALL of the keys below.

Identification:
- "isFood": true if the image mainly shows an edible food or drink, false otherwise.
- "notFoodReason": if isFood is false, one short user-facing sentence naming what the image actually
  shows (e.g. "This looks like a mobile phone, not a food item."). Empty string when isFood is true.
- "items": an array of the foods you can identify, each as {{"name": "<concise food name>", "confidence": <number 0 to 1>}}.
  Use an empty array when isFood is false.
- "modelVerdicts": an object mapping EACH candidate label to
  {{"matches": <true|false>, "confidence": <number 0 to 1>, "correctedName": "<correct name if it does not match, else empty>"}}.
  Use an empty object when there were no candidates.

Quality and food safety (use cautious language; never claim food is definitely safe or definitely spoiled):
- "freshness", "freshnessConfidence" (number 0 to 1), "foodSafety", "cookingStyle", "oilLevel",
  "portionEstimate", "visualInsights" (array), "qualitySummary", "geminiConfidence" (number 0 to 1).

Rules:
- Judge each candidate label strictly: "matches" is true only when that label is a correct name for the food actually shown.
- Keep names specific but concise (e.g. "Idli", "Masala Dosa", "Apple").
- If isFood is false, still include the quality keys using "Unknown" or empty values.
Return only the JSON object.
"""


def gemini_env_info():
    key = GEMINI_API_KEY or ""
    return {
        "envLoaded": bool(ENV_LOADED),
        "apiKeyLoaded": bool(key),
    }


def get_client():
    if not GEMINI_API_KEY:
        raise GeminiConfigurationError("GEMINI_API_KEY is not configured.")

    try:
        from google import genai
    except Exception as error:
        raise GeminiConfigurationError(
            "The google-genai SDK is not installed or cannot be imported."
        ) from error

    return genai.Client(api_key=GEMINI_API_KEY)


def validate_gemini_connection(include_exception=False):
    now = time.time()
    if _health_cache["data"] and now - _health_cache["timestamp"] < HEALTH_CACHE_SECONDS:
        cached = dict(_health_cache["data"])
        cached["cached"] = True
        if not include_exception:
            cached.pop("exception", None)
        return cached

    diagnostics = {
        "sdk": SDK_NAME,
        "model": GEMINI_MODEL,
        **gemini_env_info(),
    }

    if not diagnostics["apiKeyLoaded"]:
        result = {
            **diagnostics,
            "status": "Failed",
            "reason": "GEMINI_API_KEY is not configured.",
            "errorType": "MissingApiKey",
        }
        _health_cache.update({"timestamp": now, "data": result})
        return result

    try:
        client = get_client()
        response = client.models.generate_content(model=GEMINI_MODEL, contents="Hello")
        result = {
            **diagnostics,
            "status": "Connected",
            "sample": (getattr(response, "text", "") or "").strip()[:80],
        }
        _health_cache.update({"timestamp": now, "data": result})
        return result
    except Exception as error:
        result = {
            **diagnostics,
            "status": "Failed",
            "reason": normalize_gemini_error(error),
            "errorType": classify_gemini_error(error),
        }
        if include_exception:
            result["exception"] = str(error)
        _health_cache.update({"timestamp": now, "data": result})
        return result


def analyze_food_image(image_path):
    if not GEMINI_API_KEY:
        return disabled_analysis("GEMINI_API_KEY is not configured.", "MissingApiKey")

    try:
        client = get_client()
        image = load_image(image_path)
        response = client.models.generate_content(model=GEMINI_MODEL, contents=[PROMPT, image])
        return normalize_analysis(parse_json_response(response.text))
    except Exception as error:
        return disabled_analysis(normalize_gemini_error(error), classify_gemini_error(error))


def analyze_and_identify(image_path, model_candidates=None):
    """Single Gemini call that returns BOTH the quality/safety analysis and the
    identification verdict, to avoid making two requests per meal (which doubles
    rate-limit pressure, latency and cost).

    Returns ``{"analysis": <quality dict>, "identification": <identification dict>}``.
    On any failure both halves degrade gracefully (analysis disabled,
    identification falls back to the local model).
    """
    candidates = [c for c in (model_candidates or []) if c]
    if not GEMINI_API_KEY:
        return {
            "analysis": disabled_analysis("GEMINI_API_KEY is not configured.", "MissingApiKey"),
            "identification": disabled_identification("GEMINI_API_KEY is not configured.", "MissingApiKey"),
        }

    try:
        client = get_client()
        image = load_image(image_path)
        prompt = COMBINED_PROMPT_TEMPLATE.format(candidates=json.dumps(candidates))
        response = client.models.generate_content(model=GEMINI_MODEL, contents=[prompt, image])
        data = parse_json_response(response.text)
        return {"analysis": normalize_analysis(data), "identification": normalize_identification(data)}
    except Exception as error:
        reason = normalize_gemini_error(error)
        error_type = classify_gemini_error(error)
        return {
            "analysis": disabled_analysis(reason, error_type),
            "identification": disabled_identification(reason, error_type),
        }


def identify_food_image(image_path, model_candidates=None):
    """Ask Gemini to identify the food and arbitrate the local model's labels.

    Returns a normalized identification dict. When Gemini is unavailable the
    result has ``enabled = False`` and ``isFood = True`` so the caller falls
    back to the local detections instead of wrongly flagging "not food".
    """
    candidates = [c for c in (model_candidates or []) if c]
    if not GEMINI_API_KEY:
        return disabled_identification("GEMINI_API_KEY is not configured.", "MissingApiKey")

    try:
        client = get_client()
        image = load_image(image_path)
        prompt = IDENTIFY_PROMPT_TEMPLATE.format(candidates=json.dumps(candidates))
        response = client.models.generate_content(model=GEMINI_MODEL, contents=[prompt, image])
        return normalize_identification(parse_json_response(response.text))
    except Exception as error:
        return disabled_identification(normalize_gemini_error(error), classify_gemini_error(error))


def normalize_identification(data):
    items = []
    for raw in data.get("items") or []:
        if isinstance(raw, dict):
            name = str(raw.get("name", "")).strip()
            if name:
                items.append({"name": name, "confidence": clamp01(safe_float(raw.get("confidence", 0.5), 0.5))})
        elif isinstance(raw, str) and raw.strip():
            items.append({"name": raw.strip(), "confidence": 0.5})

    verdicts = {}
    raw_verdicts = data.get("modelVerdicts")
    if isinstance(raw_verdicts, dict):
        for label, verdict in raw_verdicts.items():
            if isinstance(verdict, dict):
                verdicts[str(label)] = {
                    "matches": bool(verdict.get("matches", False)),
                    "confidence": clamp01(safe_float(verdict.get("confidence", 0.5), 0.5)),
                    "correctedName": str(verdict.get("correctedName", "")).strip(),
                }

    return {
        "enabled": True,
        "model": GEMINI_MODEL,
        "isFood": bool(data.get("isFood", bool(items))),
        "notFoodReason": str(data.get("notFoodReason", "")).strip(),
        "items": items,
        "modelVerdicts": verdicts,
    }


def disabled_identification(reason, error_type="GeminiUnavailable"):
    return {
        "enabled": False,
        "model": GEMINI_MODEL,
        "isFood": True,
        "notFoodReason": "",
        "items": [],
        "modelVerdicts": {},
        "disabledReason": reason,
        "errorType": error_type,
    }


def clamp01(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, number))


def test_food_image(image_path):
    analysis = analyze_food_image(image_path)
    return {
        "freshness": analysis.get("freshness", "Unknown"),
        "cookingStyle": analysis.get("cookingStyle", "Unknown"),
        "oilLevel": analysis.get("oilLevel", "Unknown"),
        "qualitySummary": analysis.get("qualitySummary", ""),
        "enabled": analysis.get("enabled", False),
        "reason": analysis.get("disabledReason", ""),
        "errorType": analysis.get("errorType", ""),
    }


def load_image(image_path):
    try:
        image = Image.open(image_path)
        image.load()
        return image
    except (UnidentifiedImageError, OSError) as error:
        raise GeminiConfigurationError("Uploaded file is not a valid image.") from error


def parse_json_response(text):
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.replace("json", "", 1).strip()
    return json.loads(cleaned)


def normalize_analysis(data):
    return {
        "enabled": True,
        "model": GEMINI_MODEL,
        "freshness": data.get("freshness", "Unknown"),
        "freshnessConfidence": safe_float(data.get("freshnessConfidence", data.get("geminiConfidence", 0.5)), 0.5),
        "foodSafety": data.get("foodSafety", "No specific food-safety concerns were identified from the image."),
        "cookingStyle": data.get("cookingStyle", "Unknown"),
        "oilLevel": data.get("oilLevel", "Unknown"),
        "portionEstimate": data.get("portionEstimate", "Medium"),
        "visualInsights": normalize_list(data.get("visualInsights", [])),
        "qualitySummary": data.get("qualitySummary", "Visual quality analysis completed."),
        "geminiConfidence": safe_float(data.get("geminiConfidence", data.get("freshnessConfidence", 0.5)), 0.5),
    }


def safe_float(value, fallback):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def normalize_list(value):
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def disabled_analysis(reason, error_type="GeminiUnavailable"):
    return {
        "enabled": False,
        "model": GEMINI_MODEL,
        "freshness": "Unknown",
        "freshnessConfidence": 0,
        "foodSafety": "Gemini analysis temporarily unavailable.",
        "cookingStyle": "Unknown",
        "oilLevel": "Unknown",
        "portionEstimate": "Unknown",
        "visualInsights": [],
        "qualitySummary": "Gemini analysis temporarily unavailable.",
        "geminiConfidence": 0,
        "disabledReason": reason,
        "errorType": error_type,
    }


def classify_gemini_error(error):
    message = str(error).lower()
    if isinstance(error, GeminiConfigurationError):
        return "ConfigurationError"
    if "api_key_invalid" in message or "api key not valid" in message or "invalid api key" in message:
        return "InvalidApiKey"
    if "permission_denied" in message or "permission denied" in message or "authentication" in message:
        return "AuthenticationError"
    if "quota" in message or "rate limit" in message or "resource_exhausted" in message or "429" in message:
        return "RateLimit"
    if "model" in message and ("not found" in message or "unsupported" in message or "unavailable" in message):
        return "ModelUnavailable"
    if "connection" in message or "network" in message or "dns" in message or "timeout" in message:
        return "NetworkError"
    if "google-genai" in message or "import" in message:
        return "WrongSdk"
    return "GeminiUnavailable"


def normalize_gemini_error(error):
    error_type = classify_gemini_error(error)
    if error_type == "InvalidApiKey":
        return "The configured GEMINI_API_KEY was rejected by Google. Create a valid key in Google AI Studio and update backend/.env."
    if error_type == "AuthenticationError":
        return "The Gemini API rejected authentication for this key or project."
    if error_type == "WrongSdk":
        return "The Google Gen AI SDK is missing or misconfigured."
    if error_type == "RateLimit":
        return "The Gemini API quota or rate limit was reached."
    if error_type == "ModelUnavailable":
        return f"The configured Gemini model '{GEMINI_MODEL}' is unavailable for this API key."
    if error_type == "NetworkError":
        return "The backend could not reach the Gemini API."
    return f"Gemini analysis temporarily unavailable. {str(error)}"


class GeminiConfigurationError(Exception):
    pass
