FRIED_FOODS = {"Poori", "Vada", "Uzhuntha vadai", "Parupu vada", "Chicken 65", "Paapad"}
FRUITS = {
    "Mango",
    "apple",
    "apricots",
    "banana",
    "dragon fruit",
    "grapes",
    "guava",
    "orange",
    "peach",
    "pear",
    "pineapple",
    "strawberry",
    "sugar apple",
}
VEGETABLE_FORWARD_FOODS = {
    "Chole",
    "Dal Makhani",
    "Khichdi",
    "Rajma",
    "Sambhar",
    "Sambar",
    "Beetroot poriyal",
    "Carrot poriyal",
    "Veg briyani",
}
SWEET_FOODS = {"Gulab Jamun", "Rasgulla"}
REFINED_CARB_FOODS = {"Plain Rice", "Satham", "Biriyani", "Poori", "Poha"}
PROCESSED_OR_SALTY_FOODS = {"Paapad", "Chicken 65"}
HIGH_SAT_FAT_FOODS = {"Dal Makhani", "Panner masala", "Paneer briyani", "Gulab Jamun"}
PROTEIN_FOODS = {"Chicken briyani", "Biriyani", "Boiled Egg", "Omlette", "Chole", "Rajma", "Dal Makhani", "Panner masala"}

# Category membership per pattern key, used both by analyze_food_patterns and
# exposed to the frontend (food_categories) so the Meal Score can be recomputed
# live when the user adjusts item portions.
CATEGORY_SETS = {
    "fried_food": FRIED_FOODS,
    "fruit": FRUITS,
    "vegetable": VEGETABLE_FORWARD_FOODS,
    "sweet": SWEET_FOODS,
    "refined_carb": REFINED_CARB_FOODS,
    "processed": PROCESSED_OR_SALTY_FOODS,
    "high_sat_fat": HIGH_SAT_FAT_FOODS,
    "protein_food": PROTEIN_FOODS,
}

INGREDIENTS = {
    "Biriyani": ["Rice", "Protein or vegetables", "Oil", "Spices", "Onion", "Mint"],
    "Chicken briyani": ["Rice", "Chicken", "Oil", "Spices", "Onion", "Curd", "Mint"],
    "Dosa": ["Rice batter", "Urad dal", "Oil"],
    "Idly": ["Rice", "Urad dal", "Water"],
    "Sambhar": ["Dal", "Vegetables", "Tamarind", "Spices"],
    "Poori": ["Wheat flour", "Oil", "Salt"],
    "Vada": ["Urad dal", "Oil", "Spices"],
    "Gulab Jamun": ["Milk solids", "Sugar syrup", "Flour", "Ghee or oil"],
    "Rasgulla": ["Chenna", "Sugar syrup"],
    "Plain Rice": ["Rice", "Water"],
    "Chole": ["Chickpeas", "Tomato", "Onion", "Spices"],
    "Rajma": ["Kidney beans", "Tomato", "Onion", "Spices"],
}

ALLERGENS = {
    "Boiled Egg": ["Egg"],
    "Omlette": ["Egg"],
    "Panner masala": ["Milk"],
    "Paneer briyani": ["Milk"],
    "Dal Makhani": ["Milk"],
    "Gulab Jamun": ["Milk", "Gluten"],
    "Poori": ["Gluten"],
    "Roti": ["Gluten"],
    "Dosa": ["Legumes"],
    "Idly": ["Legumes"],
    "Vada": ["Legumes"],
    "almond": ["Tree nuts"],
    "walnut": ["Tree nuts"],
}


def analyze_food_patterns(nutrition_items):
    return {
        "detected_names": {item.get("food_name", "") for item in nutrition_items},
        "fried_food_count": sum(item.get("count", 0) for item in nutrition_items if item.get("food_name") in FRIED_FOODS),
        "fruit_count": sum(item.get("count", 0) for item in nutrition_items if item.get("food_name") in FRUITS),
        "vegetable_count": sum(item.get("count", 0) for item in nutrition_items if item.get("food_name") in VEGETABLE_FORWARD_FOODS),
        "sweet_count": sum(item.get("count", 0) for item in nutrition_items if item.get("food_name") in SWEET_FOODS),
        "refined_carb_count": sum(item.get("count", 0) for item in nutrition_items if item.get("food_name") in REFINED_CARB_FOODS),
        "processed_count": sum(item.get("count", 0) for item in nutrition_items if item.get("food_name") in PROCESSED_OR_SALTY_FOODS),
        "high_sat_fat_count": sum(item.get("count", 0) for item in nutrition_items if item.get("food_name") in HIGH_SAT_FAT_FOODS),
        "protein_food_count": sum(item.get("count", 0) for item in nutrition_items if item.get("food_name") in PROTEIN_FOODS),
        "diversity_count": len({item.get("food_name", "") for item in nutrition_items}),
    }


def build_food_category_map(nutrition_items):
    """Map each detected food name to the pattern categories it belongs to,
    so the frontend can recompute food-pattern counts after portion edits."""
    category_map = {}
    for item in nutrition_items:
        name = item.get("food_name", "")
        if not name:
            continue
        category_map[name] = [tag for tag, foods in CATEGORY_SETS.items() if name in foods]
    return category_map


def build_ingredient_breakdown(nutrition_items):
    breakdown = []
    for item in nutrition_items:
        food_name = item.get("food_name", "")
        breakdown.append(
            {
                "food_name": food_name,
                "likely_ingredients": INGREDIENTS.get(food_name, ["Main ingredient", "Spices", "Cooking oil or seasoning"]),
            }
        )
    return breakdown


def detect_allergens(nutrition_items):
    allergens = []
    for item in nutrition_items:
        food_name = item.get("food_name", "")
        for allergen in ALLERGENS.get(food_name, []):
            allergens.append({"food_name": food_name, "allergen": allergen})
    return allergens


def estimate_confidence(detected_foods, nutrition_items):
    if not detected_foods:
        return {
            "food_detection_confidence": 0,
            "nutrition_confidence": 0,
            "explanation": "No foods were detected, so nutrition could not be estimated from this image.",
        }
    avg_detection = sum(food.get("confidence", 0) for food in detected_foods) / len(detected_foods)
    known_items = [item for item in nutrition_items if item.get("serving_unit") != "serving"]
    nutrition_confidence = avg_detection * (0.75 + 0.25 * (len(known_items) / max(1, len(nutrition_items))))
    return {
        "food_detection_confidence": round(avg_detection * 100),
        "nutrition_confidence": round(nutrition_confidence * 100),
        "explanation": "Nutrition estimates are based on detected foods and standard serving sizes.",
    }
