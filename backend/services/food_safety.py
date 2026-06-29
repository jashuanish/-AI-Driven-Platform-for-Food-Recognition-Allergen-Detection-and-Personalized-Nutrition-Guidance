def build_food_safety_panel(gemini_analysis):
    freshness = gemini_analysis.get("freshness", "Unknown")
    confidence = gemini_analysis.get("geminiConfidence", gemini_analysis.get("freshnessConfidence", 0))
    alerts = []

    if freshness in {"Possibly Spoiled", "Likely Spoiled"}:
        alerts.append("There are visible signs that may indicate spoilage. Please inspect carefully before consuming.")
    if gemini_analysis.get("oilLevel") in {"High", "Very High"}:
        alerts.append("The meal appears oily, so lighter portions or fresh sides may improve balance.")
    if gemini_analysis.get("cookingStyle") in {"Fried", "Deep Fried"}:
        alerts.append("Fried preparation can increase fat and calorie density.")

    return {
        "freshness": freshness,
        "freshness_confidence": round(confidence * 100),
        "cooking_style": gemini_analysis.get("cookingStyle", "Unknown"),
        "oil_level": gemini_analysis.get("oilLevel", "Unknown"),
        "portion_estimate": gemini_analysis.get("portionEstimate", "Unknown"),
        "food_safety": gemini_analysis.get("foodSafety", ""),
        "visual_insights": gemini_analysis.get("visualInsights", []),
        "quality_summary": gemini_analysis.get("qualitySummary", ""),
        "alerts": alerts,
        "enabled": gemini_analysis.get("enabled", False),
    }


def portion_multiplier(portion_estimate):
    return {
        "Small": 0.8,
        "Medium": 1.0,
        "Large": 1.25,
        "Very Large": 1.5,
    }.get(portion_estimate, 1.0)
