import random

from services.goal_service import build_daily_targets, build_goal_advice
from services.history_service import build_history_entry, build_weekly_analytics
from services.meal_scoring import classify_meal, score_meal
from services.nutrition_engine import (
    build_ingredient_breakdown,
    build_food_category_map,
    detect_allergens,
    estimate_confidence,
    analyze_food_patterns,
)


HEALTHIER_ALTERNATIVES = {
    "Poori": {"replacement": "Chapati or phulka", "reason": "It uses less oil while keeping the meal satisfying."},
    "Gulab Jamun": {"replacement": "Fresh fruit or curd with fruit", "reason": "It reduces added sugar and adds micronutrients."},
    "Rasgulla": {"replacement": "Fruit or lightly sweetened yogurt", "reason": "It keeps dessert lighter and adds protein or fibre."},
    "Biriyani": {"replacement": "Grilled chicken with rice and salad", "reason": "It improves protein balance and adds vegetables."},
    "Vada": {"replacement": "Idli or uttapam", "reason": "Steamed or pan-cooked options are usually lighter than deep-fried foods."},
    "Plain Rice": {"replacement": "Brown rice or millet", "reason": "Whole grains provide more fibre and steadier energy."},
    "Paapad": {"replacement": "Roasted papad or salad", "reason": "It can lower added oil and sodium."},
    "Chicken 65": {"replacement": "Grilled or tandoori-style chicken", "reason": "It keeps protein high while reducing oil."},
}
NUTRITION_TIPS = [
    "Whole grains digest more slowly than refined grains and help maintain stable energy levels.",
    "Protein helps support muscle repair and keeps you feeling full for longer.",
    "Adding vegetables increases fibre, vitamins and minerals without adding many calories.",
    "Fibre supports digestion and can make a meal feel more satisfying.",
    "Vitamin C from fruits can improve iron absorption from plant foods.",
    "Drinking enough water supports digestion and helps regulate appetite cues.",
]


def generate_recommendation(nutrition_totals, user_profile, nutrition_items=None, detected_foods=None):
    nutrition_items = nutrition_items or []
    detected_foods = detected_foods or []
    goal = user_profile.get("goal", "maintenance")
    health_profile = user_profile.get("health_profile", [])

    if nutrition_totals.get("calories", 0) == 0 or not nutrition_items:
        return build_empty_result(goal, detected_foods, nutrition_items)

    patterns = analyze_food_patterns(nutrition_items)
    scored = score_meal(nutrition_totals, user_profile, patterns)
    meal_rating = scored["score"]
    category, category_summary = classify_meal(meal_rating)
    targets = build_daily_targets(user_profile)
    daily_progress = build_daily_progress(nutrition_totals, targets)
    history_entry = build_history_entry(nutrition_items, nutrition_totals, meal_rating)
    warnings = build_health_warnings(nutrition_totals, patterns, health_profile)
    missing = build_missing_nutrients(nutrition_totals, patterns)
    alternatives = build_alternatives(patterns["detected_names"], meal_rating)
    simulator = build_improvement_simulation(nutrition_totals, meal_rating, alternatives, patterns)
    allergens = detect_allergens(nutrition_items)
    hydration = build_hydration_recommendation(user_profile, patterns)

    return {
        "recommendations": scored["reasons"],
        "meal_rating": meal_rating,
        "meal_category": category,
        "category_summary": category_summary,
        "overall_assessment": build_assessment(category, nutrition_totals, patterns),
        "positive_points": scored["positive_points"] or ["This meal can fit into a balanced day with mindful portions."],
        "things_to_improve": scored["things_to_improve"] or ["Keep meals varied across the day for broader nutrition."],
        "health_warnings": warnings,
        "healthier_alternatives": alternatives,
        "meal_improvement_simulation": simulator,
        "missing_nutrients": missing,
        "goal_advice": build_goal_advice(goal),
        "nutrition_tip": random.choice(NUTRITION_TIPS),
        "meal_balance": build_meal_balance(nutrition_totals, targets),
        "daily_progress": daily_progress,
        "meal_history_entry": history_entry,
        "meal_history": [history_entry],
        "weekly_analytics": build_weekly_analytics([history_entry]),
        "ingredient_breakdown": build_ingredient_breakdown(nutrition_items),
        "allergy_warnings": allergens,
        "hydration": hydration,
        "grocery_suggestions": build_grocery_suggestions(missing),
        "confidence": estimate_confidence(detected_foods, nutrition_items),
        "score_factors": {key: value for key, value in patterns.items() if key != "detected_names"},
        "food_categories": build_food_category_map(nutrition_items),
    }


def build_empty_result(goal, detected_foods, nutrition_items):
    return {
        "recommendations": [
            "No food items were detected, so the meal could not be nutritionally assessed.",
            "Try a clearer, well-lit image with the whole plate visible.",
            "Once foods are detected, the score will consider protein, fibre, calories, fruits, vegetables, and cooking style.",
        ],
        "meal_rating": 1,
        "meal_category": "Unable to Assess",
        "category_summary": "No foods were detected in this image.",
        "overall_assessment": "I could not detect foods in this image, so there is not enough information to assess the meal. Try a clearer, well-lit photo with the whole plate visible.",
        "positive_points": [],
        "things_to_improve": ["Upload a clearer meal image so the system can assess it accurately."],
        "health_warnings": [],
        "healthier_alternatives": [],
        "meal_improvement_simulation": {},
        "missing_nutrients": [],
        "goal_advice": build_goal_advice(goal),
        "nutrition_tip": random.choice(NUTRITION_TIPS),
        "meal_balance": {},
        "daily_progress": {},
        "meal_history_entry": None,
        "meal_history": [],
        "weekly_analytics": build_weekly_analytics([]),
        "ingredient_breakdown": build_ingredient_breakdown(nutrition_items),
        "allergy_warnings": [],
        "hydration": {"daily_water_liters": 2.2, "message": "Keep water nearby and sip regularly through the day."},
        "grocery_suggestions": [],
        "confidence": estimate_confidence(detected_foods, nutrition_items),
        "score_factors": {"fried_food_count": 0, "fruit_count": 0, "vegetable_count": 0, "sweet_count": 0, "refined_carb_count": 0},
    }


def build_assessment(category, totals, patterns):
    protein = totals.get("protein_g", 0)
    fiber = totals.get("fiber_g", 0)
    if category in {"Excellent Choice", "Healthy Meal"}:
        return "This meal offers a good balance of energy and nutrients. It can support a healthy routine, especially when paired with variety across the rest of the day."
    if category == "Moderately Healthy":
        return "This meal contains useful nutrients, but it could be improved with more fibre, vegetables, or protein depending on the rest of your day."
    if patterns["fried_food_count"]:
        return "This meal includes fried or calorie-dense items. Enjoying meals like this occasionally is perfectly fine, and adding vegetables or choosing lighter cooking methods can improve overall nutrition."
    if protein < 15 or fiber < 5 or not (patterns["fruit_count"] or patterns["vegetable_count"]):
        return "This meal has some nutritional gaps, such as lower protein, fibre, fruit, or vegetable content. A simple side like dal, salad, fruit, eggs, or paneer can make it more complete."
    return "This meal can fit into your diet, but paying attention to portions and adding nutrient-dense sides would improve its overall balance."


def build_health_warnings(totals, patterns, health_profile):
    warnings = []
    if totals.get("protein_g", 0) < 15:
        warnings.append({"label": "Low Protein", "message": "Adding dal, eggs, paneer, chicken, chole, or rajma can improve satiety."})
    if totals.get("fiber_g", 0) < 5:
        warnings.append({"label": "Low Fibre", "message": "Vegetables, fruit, legumes, or whole grains can raise fibre gently."})
    if totals.get("calories", 0) > 800:
        warnings.append({"label": "High Calorie Meal", "message": "This can still fit your day; consider lighter portions at another meal."})
    if patterns["sweet_count"]:
        warnings.append({"label": "High Sugar", "message": "Sweet foods are best balanced with fibre-rich foods or enjoyed in smaller portions."})
    if patterns["processed_count"]:
        warnings.append({"label": "High Sodium", "message": "Drink water and pair salty foods with fresh fruits or vegetables."})
    if patterns["high_sat_fat_count"]:
        warnings.append({"label": "Higher Saturated Fat", "message": "Choosing grilled or lighter dairy options more often can support heart health."})
    if "diabetes" in health_profile and patterns["sweet_count"]:
        warnings.append({"label": "Diabetes-Aware Note", "message": "Sweet desserts may raise blood sugar; fruit, curd, or smaller portions may be easier to balance."})
    if "hypertension" in health_profile and patterns["processed_count"]:
        warnings.append({"label": "Hypertension-Aware Note", "message": "This meal may be salty, so choose low-sodium sides and hydrate well."})
    if "high_cholesterol" in health_profile and patterns["fried_food_count"]:
        warnings.append({"label": "Cholesterol-Aware Note", "message": "Grilled or steamed alternatives can reduce fried fat intake."})
    return warnings[:6]


def build_missing_nutrients(totals, patterns):
    missing = []
    if totals.get("fiber_g", 0) < 5:
        missing.append({"nutrient": "Fibre", "foods": ["Vegetables", "Fruit", "Dal", "Beans", "Millets"]})
    if totals.get("protein_g", 0) < 15:
        missing.append({"nutrient": "Protein", "foods": ["Eggs", "Paneer", "Chicken", "Lentils", "Greek yogurt"]})
    if not patterns["fruit_count"]:
        missing.append({"nutrient": "Vitamin C", "foods": ["Orange", "Guava", "Strawberry", "Mango"]})
    if not patterns["vegetable_count"]:
        missing.append({"nutrient": "Iron and minerals", "foods": ["Spinach", "Beans", "Lentils", "Chole"]})
    if patterns["high_sat_fat_count"] or patterns["fried_food_count"]:
        missing.append({"nutrient": "Healthy fats", "foods": ["Almonds", "Walnuts", "Seeds", "Avocado"]})
    return missing[:5]


def build_alternatives(detected_names, score):
    if score >= 7:
        return []
    alternatives = []
    for name in detected_names:
        if name in HEALTHIER_ALTERNATIVES:
            item = HEALTHIER_ALTERNATIVES[name]
            alternatives.append({"food": name, "suggestion": item["replacement"], "why": item["reason"]})
    if not alternatives:
        alternatives.append({"food": "Meal balance", "suggestion": "Add salad, fruit, curd, or dal", "why": "This improves fibre, protein, and micronutrient coverage."})
    return alternatives[:4]


def build_improvement_simulation(totals, current_score, alternatives, patterns):
    changes = []
    if alternatives:
        first = alternatives[0]
        changes.append(f"Replace {first['food']} with {first['suggestion']}.")
    if patterns["vegetable_count"] == 0:
        changes.append("Add cucumber salad or cooked vegetables.")
    if totals.get("protein_g", 0) < 20:
        changes.append("Add dal, eggs, paneer, chicken, chole, or rajma.")
    estimated_totals = {
        "calories": max(0, round(totals.get("calories", 0) - (90 if patterns["fried_food_count"] else 0))),
        "protein_g": round(totals.get("protein_g", 0) + (8 if totals.get("protein_g", 0) < 20 else 0), 1),
        "carbs_g": max(0, round(totals.get("carbs_g", 0) - (12 if patterns["refined_carb_count"] else 0), 1)),
        "fat_g": max(0, round(totals.get("fat_g", 0) - (6 if patterns["fried_food_count"] else 0), 1)),
        "fiber_g": round(totals.get("fiber_g", 0) + (4 if patterns["vegetable_count"] == 0 else 2), 1),
    }
    return {
        "current_score": current_score,
        "suggested_changes": changes or ["Keep this meal balanced with vegetables and protein across the day."],
        "estimated_new_score": min(10, round(current_score + 1.4 + (0.6 if patterns["fried_food_count"] else 0), 1)),
        "estimated_nutrition": estimated_totals,
    }


def build_meal_balance(totals, targets):
    return {
        "protein_g": build_balance_item(totals.get("protein_g", 0), targets["protein_g"] * 0.35),
        "carbs_g": build_balance_item(totals.get("carbs_g", 0), targets["carbs_g"] * 0.35),
        "fat_g": build_balance_item(totals.get("fat_g", 0), targets["fat_g"] * 0.35),
        "fiber_g": build_balance_item(totals.get("fiber_g", 0), targets["fiber_g"] * 0.35),
    }


def build_balance_item(value, target):
    percent = round(min(100, (value / target) * 100 if target else 0))
    return {"value": value, "target": round(target, 1), "percent": percent}


def build_daily_progress(totals, targets):
    return {key: {"current": totals.get(key, 0), "target": target, "percent": round(min(100, (totals.get(key, 0) / target) * 100 if target else 0))} for key, target in targets.items()}


def build_hydration_recommendation(user_profile, patterns):
    base = 2.2
    if user_profile.get("goal") == "muscle_gain":
        base = 2.7
    if patterns["processed_count"]:
        base += 0.3
    return {"daily_water_liters": round(base, 1), "message": "Hydrate a little extra after salty meals." if patterns["processed_count"] else "Sip water regularly through the day."}


def build_grocery_suggestions(missing_nutrients):
    suggestions = []
    for item in missing_nutrients:
        suggestions.extend(item.get("foods", [])[:3])
    return list(dict.fromkeys(suggestions))[:8]
