import json
from pathlib import Path


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "nutrition.json"
DEFAULT_NUTRITION = {
    "calories_per_piece": 150,
    "protein_g": 5,
    "carbs_g": 25,
    "fat_g": 5,
    "fiber_g": 2,
    "serving_unit": "serving",
}


def load_nutrition_db():
    with DATA_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def calculate_nutrition(detected_foods):
    nutrition_db = load_nutrition_db()
    items = []
    totals = {
        "calories": 0,
        "protein_g": 0,
        "carbs_g": 0,
        "fat_g": 0,
        "fiber_g": 0,
    }

    for detected_food in detected_foods:
        food_name = detected_food.get("food_name", "Unknown")
        count = int(detected_food.get("count", 1))
        nutrition = nutrition_db.get(food_name, DEFAULT_NUTRITION)

        item = {
            "food_name": food_name,
            "count": count,
            "calories": round(nutrition.get("calories_per_piece", 0) * count, 2),
            "protein_g": round(nutrition.get("protein_g", 0) * count, 2),
            "carbs_g": round(nutrition.get("carbs_g", 0) * count, 2),
            "fat_g": round(nutrition.get("fat_g", 0) * count, 2),
            "fiber_g": round(nutrition.get("fiber_g", 0) * count, 2),
            "serving_unit": nutrition.get("serving_unit", "serving"),
        }

        items.append(item)
        for key in totals:
            totals[key] = round(totals[key] + item[key], 2)

    return {"items": items, "totals": totals}
