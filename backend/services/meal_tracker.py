from datetime import datetime


MICRO_TARGETS = {
    "sugar_g": 36,
    "sodium_mg": 2300,
    "calcium_mg": 1000,
    "iron_mg": 18,
    "vitamin_a_mcg": 900,
    "vitamin_c_mg": 90,
    "vitamin_d_mcg": 20,
    "potassium_mg": 3400,
    "magnesium_mg": 400,
    "water_liters": 2.4,
}


def estimate_micronutrients(nutrition_items, totals):
    if not nutrition_items:
        return {
            "sugar_g": 0,
            "sodium_mg": 0,
            "calcium_mg": 0,
            "iron_mg": 0,
            "vitamin_a_mcg": 0,
            "vitamin_c_mg": 0,
            "vitamin_d_mcg": 0,
            "potassium_mg": 0,
            "magnesium_mg": 0,
            "water_liters": 0,
        }

    fruit_or_veg = sum(1 for item in nutrition_items if item.get("fiber_g", 0) >= 2)
    return {
        "sugar_g": round(totals.get("carbs_g", 0) * 0.18, 1),
        "sodium_mg": 450 + (120 * len(nutrition_items)),
        "calcium_mg": 120 + (60 * fruit_or_veg),
        "iron_mg": round(2.2 + (0.6 * fruit_or_veg), 1),
        "vitamin_a_mcg": 220 + (90 * fruit_or_veg),
        "vitamin_c_mg": 18 + (16 * fruit_or_veg),
        "vitamin_d_mcg": 2,
        "potassium_mg": 650 + (160 * fruit_or_veg),
        "magnesium_mg": 80 + (25 * fruit_or_veg),
        "water_liters": 0,
    }


def classify_meal_type(now=None):
    hour = (now or datetime.now()).hour
    if 5 <= hour < 11:
        return "Breakfast"
    if 11 <= hour < 16:
        return "Lunch"
    if 16 <= hour < 19:
        return "Snack"
    return "Dinner"


def build_remaining(consumed, targets):
    return {
        key: {
            "consumed": round(consumed.get(key, 0), 1),
            "target": round(target, 1),
            "remaining": round(max(0, target - consumed.get(key, 0)), 1),
            "percent": round(min(100, (consumed.get(key, 0) / target) * 100 if target else 0)),
        }
        for key, target in targets.items()
    }


def build_daily_summary(remaining):
    summary = []
    if remaining.get("protein_g", {}).get("percent", 0) >= 70:
        summary.append("Excellent protein intake so far today.")
    else:
        summary.append("Protein is still available in your daily target.")
    if remaining.get("fiber_g", {}).get("percent", 0) < 50:
        summary.append("Fibre is still on the lower side today; vegetables, fruits, or dal can help.")
    if remaining.get("sodium_mg", {}).get("remaining", 0) < 500:
        summary.append("Sodium is getting close to the daily target, so lighter low-salt choices may help.")
    if remaining.get("vitamin_c_mg", {}).get("percent", 0) < 50:
        summary.append("Add citrus, guava, strawberries, or mango for more Vitamin C.")
    if remaining.get("water_liters", {}).get("percent", 0) < 50:
        summary.append("Hydration is below the daily target; keep water nearby.")
    return summary[:5]
