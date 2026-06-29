def clamp_score(score):
    return round(max(1, min(10, score)), 1)


def classify_meal(score):
    if score >= 9:
        return "Excellent Choice", "Very balanced meal with strong nutritional quality."
    if score >= 7:
        return "Healthy Meal", "Good overall nutrition with only minor improvements suggested."
    if score >= 5:
        return "Moderately Healthy", "Acceptable meal that could become stronger with a few changes."
    if score >= 3:
        return "Needs Improvement", "Some nutritional imbalances are present, so keep this type of meal occasional."
    return "Occasional Treat", "Best enjoyed occasionally while balancing the rest of the day with lighter, fibre-rich foods."


def score_meal(totals, user_profile, patterns):
    goal = user_profile.get("goal", "maintenance")
    daily_calorie_target = int(user_profile.get("daily_calorie_target", 2000))
    calories = totals.get("calories", 0)
    protein = totals.get("protein_g", 0)
    carbs = totals.get("carbs_g", 0)
    fat = totals.get("fat_g", 0)
    fiber = totals.get("fiber_g", 0)

    score = 5.0
    positive = []
    improve = []
    reasons = []

    meal_target = daily_calorie_target * 0.35
    calorie_ratio = calories / meal_target if meal_target else 0
    if 0.55 <= calorie_ratio <= 1.15:
        score += 1.2
        positive.append("Calories are reasonable for a single meal.")
        reasons.append("The calorie level fits well within a typical meal portion.")
    elif calorie_ratio > 1.45:
        score -= 1.3
        improve.append("Consider reducing portion size or balancing the meal with lighter sides.")
        reasons.append("The meal is calorie-dense for one sitting.")
    elif calorie_ratio < 0.45:
        score -= 0.4
        improve.append("Add a nourishing side if this is meant to be a full meal.")
        reasons.append("The meal may be too light to keep you satisfied for long.")

    if protein >= 25:
        score += 1.6
        positive.append("Good protein intake.")
        reasons.append("High protein content supports muscle maintenance and satiety.")
    elif protein >= 15:
        score += 0.8
        positive.append("Moderate protein content.")
        reasons.append("The meal includes some protein, which helps make it more balanced.")
    else:
        score -= 0.8
        improve.append("Increase protein with eggs, paneer, chicken, dal, chole, or rajma.")
        reasons.append("Protein is on the lower side for a balanced meal.")

    if fiber >= 8:
        score += 1.2
        positive.append("Good fibre content.")
        reasons.append("Dietary fibre supports digestion and steady fullness.")
    elif fiber >= 5:
        score += 0.6
        positive.append("Decent fibre content.")
        reasons.append("The meal includes a useful amount of fibre.")
    else:
        score -= 0.8
        improve.append("Add vegetables, fruit, dal, or legumes for more fibre.")
        reasons.append("Low fibre reduces the meal's overall nutritional quality.")

    if patterns["fruit_count"] or patterns["vegetable_count"]:
        score += min(1.2, 0.6 + 0.3 * (patterns["fruit_count"] + patterns["vegetable_count"]))
        if patterns["fruit_count"]:
            positive.append("Contains fruit.")
            reasons.append("Fruit adds fibre, vitamins, and natural sweetness.")
        if patterns["vegetable_count"]:
            positive.append("Includes vegetable or legume-rich foods.")
            reasons.append("Vegetable and legume-rich foods improve micronutrient quality.")
    else:
        score -= 0.7
        improve.append("Add vegetables or fruit to improve micronutrients.")
        reasons.append("Vegetable and fruit content appears low.")

    if fat <= 25 and patterns["fried_food_count"] == 0:
        score += 0.7
        positive.append("Fat level looks moderate.")
        reasons.append("The meal does not appear overly oily based on detected foods.")
    elif fat > 35:
        score -= 1.0
        improve.append("Choose lighter cooking methods or reduce oily sides.")
        reasons.append("Higher fat content can increase calorie density.")

    if patterns["fried_food_count"]:
        score -= min(1.2, 0.5 + 0.25 * patterns["fried_food_count"])
        improve.append("Reduce fried foods or choose steamed, grilled, or roasted options more often.")
        reasons.append("Fried foods increase overall fat intake.")

    if patterns["sweet_count"]:
        score -= min(1.0, 0.45 * patterns["sweet_count"])
        improve.append("Keep sweets as an occasional part of the meal or choose fruit more often.")
        reasons.append("Sweet foods can raise added sugar and calorie density.")

    if patterns["processed_count"]:
        score -= min(0.8, 0.35 * patterns["processed_count"])
        improve.append("Balance processed or salty foods with fresh sides and enough water.")
        reasons.append("Some detected foods may be higher in sodium.")

    if patterns["high_sat_fat_count"]:
        score -= min(0.8, 0.35 * patterns["high_sat_fat_count"])
        improve.append("Choose lighter dairy or grilled options when saturated fat is high.")
        reasons.append("Some foods may be higher in saturated fat.")

    if patterns["refined_carb_count"] and carbs > 65:
        score -= 0.7
        improve.append("Balance refined carbohydrates with protein, vegetables, or whole grains.")
        reasons.append("Refined carbohydrate content appears high.")

    if patterns["diversity_count"] >= 3:
        score += 0.5
        positive.append("Good meal diversity.")
        reasons.append("A variety of foods usually improves nutrient coverage.")
    elif patterns["diversity_count"] == 1:
        score -= 0.3
        improve.append("Add one more food group for better meal balance.")

    if goal == "weight_loss":
        if calories <= daily_calorie_target * 0.35 and protein >= 15:
            score += 0.7
            positive.append("Supports a weight-loss goal with mindful portions.")
        else:
            score -= 0.4
            improve.append("For weight loss, reduce portions and add vegetables with lean protein.")
    elif goal == "muscle_gain":
        if protein >= 25:
            score += 0.9
            positive.append("Protein level supports muscle gain.")
        else:
            score -= 0.5
            improve.append("For muscle gain, add eggs, paneer, chicken, lentils, chole, or rajma.")
    else:
        positive.append("Maintain variety and balance across meals.")

    return {
        "score": clamp_score(score),
        "positive_points": unique_items(positive)[:6],
        "things_to_improve": unique_items(improve)[:6],
        "reasons": unique_items(reasons)[:6],
    }


def unique_items(items):
    seen = set()
    output = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            output.append(item)
    return output
