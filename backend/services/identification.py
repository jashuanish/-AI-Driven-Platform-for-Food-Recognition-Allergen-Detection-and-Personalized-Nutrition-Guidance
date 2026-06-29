"""Reconcile local YOLO detections with Gemini's identification verdict.

The flow requested by the product:

1. The local YOLO model detects candidate foods (with a confidence score).
2. Gemini reviews the same image together with YOLO's candidate labels.
3. If Gemini confirms a label, it is kept and marked as verified.
4. If Gemini rejects a label, Gemini's decision wins (it overrides with the
   corrected name, or the label is dropped).
5. If the local model found nothing, Gemini identifies the item directly; if the
   image is not food at all, the meal is flagged as "not a food item".

When Gemini is unavailable the local detections pass through unchanged so the
app keeps working (graceful degradation).
"""


def reconcile_foods(yolo_foods, gemini_id):
    """Return ``(final_foods, identification_summary)``.

    ``final_foods`` keeps the detection shape the rest of the pipeline expects
    (``food_name``, ``count``, ``confidence``, ``bounding_boxes``) plus
    provenance fields (``source``, ``status``, ``model_confidence``,
    ``gemini_confidence``).
    """
    yolo_foods = yolo_foods or []
    gemini_id = gemini_id or {}
    verdicts = gemini_id.get("modelVerdicts") or {}
    gemini_items = gemini_id.get("items") or []
    gemini_enabled = bool(gemini_id.get("enabled"))
    is_food = gemini_id.get("isFood", True)

    # Gemini's confidence in each food it identified, keyed by normalized name.
    # Used so an overridden detection inherits Gemini's confidence in the
    # corrected food rather than its (near-zero) confidence that the rejected
    # label matched.
    item_confidence = {
        _normalize_name(item.get("name", "")): item.get("confidence", 0.5)
        for item in gemini_items
        if item.get("name")
    }

    # Gemini offline -> trust the local model as-is.
    if not gemini_enabled:
        final = [_with_source(food, "model", None, "unverified") for food in yolo_foods]
        return final, _summary(final, gemini_id, "model_only", [])

    final = []
    rejected = []
    for food in yolo_foods:
        label = food.get("food_name", "")
        verdict = verdicts.get(label)
        if verdict is None:
            # Gemini did not rule on this label -> keep it but mark unverified.
            final.append(_with_source(food, "model", None, "unverified"))
        elif verdict.get("matches"):
            final.append(_with_source(food, "model_confirmed", verdict.get("confidence"), "confirmed"))
        else:
            # Mismatch -> Gemini's decision wins.
            rejected.append(label)
            corrected = (verdict.get("correctedName") or "").strip()
            if corrected:
                confidence = item_confidence.get(_normalize_name(corrected), verdict.get("confidence", 0.5))
                final.append(_gemini_food(corrected, confidence, food.get("count", 1), "gemini_override"))

    if final:
        decision = "reconciled" if rejected else "confirmed"
        return final, _summary(final, gemini_id, decision, rejected)

    # Nothing from the local model survived: either YOLO was empty or every
    # label was rejected without a correction. Defer entirely to Gemini.
    if not is_food:
        return [], _summary([], gemini_id, "not_food", rejected)

    seen = set()
    for item in gemini_items:
        name = (item.get("name") or "").strip()
        key = _normalize_name(name)
        if name and key not in seen:
            seen.add(key)
            final.append(_gemini_food(name, item.get("confidence", 0.5), 1, "gemini"))

    decision = "gemini_only" if final else "none"
    return final, _summary(final, gemini_id, decision, rejected)


def _with_source(food, source, gemini_confidence, status):
    out = dict(food)
    out["source"] = source
    out["status"] = status
    out["model_confidence"] = food.get("confidence", 0)
    out["gemini_confidence"] = round(float(gemini_confidence), 4) if gemini_confidence is not None else None
    return out


def _gemini_food(name, confidence, count, origin):
    conf = round(float(confidence or 0), 4)
    return {
        "food_name": name,
        "count": int(count or 1),
        "confidence": conf,
        "bounding_boxes": [],
        "source": origin,
        "status": "gemini_decided",
        "model_confidence": None,
        "gemini_confidence": conf,
    }


def _summary(final, gemini_id, decision, rejected):
    return {
        "decision": decision,
        "isFood": decision != "not_food",
        "notFoodReason": gemini_id.get("notFoodReason", "") if decision == "not_food" else "",
        "geminiEnabled": bool(gemini_id.get("enabled")),
        "geminiItems": gemini_id.get("items", []),
        "rejectedLabels": rejected,
        "finalCount": len(final),
    }


def _normalize_name(name):
    return "".join(ch for ch in str(name).lower() if ch.isalnum())
