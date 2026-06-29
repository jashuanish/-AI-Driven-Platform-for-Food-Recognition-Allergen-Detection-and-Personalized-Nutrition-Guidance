def build_goal_advice(goal):
    if goal == "weight_loss":
        return [
            "Keep portions moderate and build the plate around vegetables and protein.",
            "Choose grilled, steamed, or roasted foods more often than fried foods.",
            "Add protein so the meal feels satisfying for longer.",
        ]
    if goal == "muscle_gain":
        return [
            "Increase protein with eggs, paneer, chicken, lentils, chole, or rajma.",
            "Pair carbohydrates with protein to support training recovery.",
            "Include enough total calories across the day to support muscle gain.",
        ]
    return [
        "Maintain balance and variety across meals.",
        "Include fruits, vegetables, protein, and whole grains through the day.",
        "Limit excessive processed or deep-fried foods while still enjoying flexibility.",
    ]


from services.meal_tracker import MICRO_TARGETS


def build_daily_targets(user_profile):
    calories = int(user_profile.get("daily_calorie_target", 2000))
    goal = user_profile.get("goal", "maintenance")
    weight_kg = float(user_profile.get("weight_kg", 70) or 70)
    activity = user_profile.get("activity_level", "moderate")

    activity_factor = {
        "sedentary": 0.92,
        "light": 1.0,
        "moderate": 1.08,
        "active": 1.18,
    }.get(activity, 1.0)
    if goal == "weight_loss":
        calories = round(calories * 0.9)
    elif goal == "muscle_gain":
        calories = round(calories * 1.1)
    calories = round(calories * activity_factor)

    protein_multiplier = 0.24 if goal == "muscle_gain" else 0.18
    targets = {
        "calories": calories,
        "protein_g": max(round(weight_kg * (1.8 if goal == "muscle_gain" else 1.3)), round((calories * protein_multiplier) / 4)),
        "carbs_g": round((calories * 0.5) / 4),
        "fat_g": round((calories * 0.28) / 9),
        "fiber_g": 30 if calories >= 2000 else 25,
    }
    targets.update(MICRO_TARGETS)
    if goal == "muscle_gain":
        targets["water_liters"] = 2.8
    return targets
