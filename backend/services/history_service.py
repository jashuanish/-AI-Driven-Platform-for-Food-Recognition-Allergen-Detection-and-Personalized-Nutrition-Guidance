from datetime import datetime


def build_history_entry(nutrition_items, totals, meal_rating, meal_type="Meal"):
    return {
        "id": datetime.now().isoformat(timespec="seconds"),
        "date": datetime.now().strftime("%Y-%m-%d"),
        "meal_type": meal_type,
        "foods": [item.get("food_name") for item in nutrition_items],
        "calories": totals.get("calories", 0),
        "score": meal_rating,
    }


def build_weekly_analytics(history_entries):
    if not history_entries:
        return {
            "average_calories": 0,
            "average_protein_g": 0,
            "average_score": 0,
            "best_meal": None,
            "least_balanced_meal": None,
            "weekly_trend": [],
        }
    return {
        "average_calories": round(sum(entry.get("calories", 0) for entry in history_entries) / len(history_entries), 1),
        "average_protein_g": 0,
        "average_score": round(sum(entry.get("score", 0) for entry in history_entries) / len(history_entries), 1),
        "best_meal": max(history_entries, key=lambda entry: entry.get("score", 0)),
        "least_balanced_meal": min(history_entries, key=lambda entry: entry.get("score", 0)),
        "weekly_trend": [{"date": entry.get("date"), "score": entry.get("score")} for entry in history_entries],
    }
