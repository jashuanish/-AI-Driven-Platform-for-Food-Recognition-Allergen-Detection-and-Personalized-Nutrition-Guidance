// Client-side mirror of backend/services/meal_scoring.py.
//
// The backend scores the meal as detected, but the UI lets the user adjust
// item portions (the +/- counts). This port recomputes the Meal Score live
// from the edited totals + item counts so the score, category, and
// improvement simulation always match the portions on screen. With the
// originally detected counts it reproduces the backend score exactly.

export interface MealTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface MealPatterns {
  fried_food_count: number;
  fruit_count: number;
  vegetable_count: number;
  sweet_count: number;
  refined_carb_count: number;
  processed_count: number;
  high_sat_fat_count: number;
  diversity_count: number;
}

export interface ScoreProfile {
  goal: string;
  daily_calorie_target: number;
}

export interface MealScoreResult {
  score: number;
  positive_points: string[];
  things_to_improve: string[];
  reasons: string[];
}

const TAG_TO_PATTERN: Record<string, keyof MealPatterns> = {
  fried_food: "fried_food_count",
  fruit: "fruit_count",
  vegetable: "vegetable_count",
  sweet: "sweet_count",
  refined_carb: "refined_carb_count",
  processed: "processed_count",
  high_sat_fat: "high_sat_fat_count",
};

// Recompute pattern counts from the current item list, using the per-food
// category map returned by the backend (food_categories).
export function recomputePatterns(items: any[], categoryMap: Record<string, string[]> = {}): MealPatterns {
  const patterns: MealPatterns = {
    fried_food_count: 0,
    fruit_count: 0,
    vegetable_count: 0,
    sweet_count: 0,
    refined_carb_count: 0,
    processed_count: 0,
    high_sat_fat_count: 0,
    diversity_count: 0,
  };
  const names = new Set<string>();
  for (const item of items) {
    const name = item.food_name || "";
    if (name) names.add(name);
    const count = item.count || 0;
    for (const tag of categoryMap[name] || []) {
      const key = TAG_TO_PATTERN[tag];
      if (key) patterns[key] += count;
    }
  }
  patterns.diversity_count = names.size;
  return patterns;
}

function clampScore(score: number): number {
  return Math.round(Math.max(1, Math.min(10, score)) * 10) / 10;
}

export function classifyMeal(score: number): [string, string] {
  if (score >= 9) return ["Excellent Choice", "Very balanced meal with strong nutritional quality."];
  if (score >= 7) return ["Healthy Meal", "Good overall nutrition with only minor improvements suggested."];
  if (score >= 5) return ["Moderately Healthy", "Acceptable meal that could become stronger with a few changes."];
  if (score >= 3) return ["Needs Improvement", "Some nutritional imbalances are present, so keep this type of meal occasional."];
  return ["Occasional Treat", "Best enjoyed occasionally while balancing the rest of the day with lighter, fibre-rich foods."];
}

function uniqueItems(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (item && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

export function scoreMeal(totals: MealTotals, profile: ScoreProfile, patterns: MealPatterns): MealScoreResult {
  const goal = profile.goal || "maintenance";
  const dailyCalorieTarget = Number(profile.daily_calorie_target) || 2000;
  const calories = totals.calories || 0;
  const protein = totals.protein_g || 0;
  const carbs = totals.carbs_g || 0;
  const fat = totals.fat_g || 0;
  const fiber = totals.fiber_g || 0;

  let score = 5.0;
  const positive: string[] = [];
  const improve: string[] = [];
  const reasons: string[] = [];

  const mealTarget = dailyCalorieTarget * 0.35;
  const calorieRatio = mealTarget ? calories / mealTarget : 0;
  if (calorieRatio >= 0.55 && calorieRatio <= 1.15) {
    score += 1.2;
    positive.push("Calories are reasonable for a single meal.");
    reasons.push("The calorie level fits well within a typical meal portion.");
  } else if (calorieRatio > 1.45) {
    score -= 1.3;
    improve.push("Consider reducing portion size or balancing the meal with lighter sides.");
    reasons.push("The meal is calorie-dense for one sitting.");
  } else if (calorieRatio < 0.45) {
    score -= 0.4;
    improve.push("Add a nourishing side if this is meant to be a full meal.");
    reasons.push("The meal may be too light to keep you satisfied for long.");
  }

  if (protein >= 25) {
    score += 1.6;
    positive.push("Good protein intake.");
    reasons.push("High protein content supports muscle maintenance and satiety.");
  } else if (protein >= 15) {
    score += 0.8;
    positive.push("Moderate protein content.");
    reasons.push("The meal includes some protein, which helps make it more balanced.");
  } else {
    score -= 0.8;
    improve.push("Increase protein with eggs, paneer, chicken, dal, chole, or rajma.");
    reasons.push("Protein is on the lower side for a balanced meal.");
  }

  if (fiber >= 8) {
    score += 1.2;
    positive.push("Good fibre content.");
    reasons.push("Dietary fibre supports digestion and steady fullness.");
  } else if (fiber >= 5) {
    score += 0.6;
    positive.push("Decent fibre content.");
    reasons.push("The meal includes a useful amount of fibre.");
  } else {
    score -= 0.8;
    improve.push("Add vegetables, fruit, dal, or legumes for more fibre.");
    reasons.push("Low fibre reduces the meal's overall nutritional quality.");
  }

  if (patterns.fruit_count || patterns.vegetable_count) {
    score += Math.min(1.2, 0.6 + 0.3 * (patterns.fruit_count + patterns.vegetable_count));
    if (patterns.fruit_count) {
      positive.push("Contains fruit.");
      reasons.push("Fruit adds fibre, vitamins, and natural sweetness.");
    }
    if (patterns.vegetable_count) {
      positive.push("Includes vegetable or legume-rich foods.");
      reasons.push("Vegetable and legume-rich foods improve micronutrient quality.");
    }
  } else {
    score -= 0.7;
    improve.push("Add vegetables or fruit to improve micronutrients.");
    reasons.push("Vegetable and fruit content appears low.");
  }

  if (fat <= 25 && patterns.fried_food_count === 0) {
    score += 0.7;
    positive.push("Fat level looks moderate.");
    reasons.push("The meal does not appear overly oily based on detected foods.");
  } else if (fat > 35) {
    score -= 1.0;
    improve.push("Choose lighter cooking methods or reduce oily sides.");
    reasons.push("Higher fat content can increase calorie density.");
  }

  if (patterns.fried_food_count) {
    score -= Math.min(1.2, 0.5 + 0.25 * patterns.fried_food_count);
    improve.push("Reduce fried foods or choose steamed, grilled, or roasted options more often.");
    reasons.push("Fried foods increase overall fat intake.");
  }

  if (patterns.sweet_count) {
    score -= Math.min(1.0, 0.45 * patterns.sweet_count);
    improve.push("Keep sweets as an occasional part of the meal or choose fruit more often.");
    reasons.push("Sweet foods can raise added sugar and calorie density.");
  }

  if (patterns.processed_count) {
    score -= Math.min(0.8, 0.35 * patterns.processed_count);
    improve.push("Balance processed or salty foods with fresh sides and enough water.");
    reasons.push("Some detected foods may be higher in sodium.");
  }

  if (patterns.high_sat_fat_count) {
    score -= Math.min(0.8, 0.35 * patterns.high_sat_fat_count);
    improve.push("Choose lighter dairy or grilled options when saturated fat is high.");
    reasons.push("Some foods may be higher in saturated fat.");
  }

  if (patterns.refined_carb_count && carbs > 65) {
    score -= 0.7;
    improve.push("Balance refined carbohydrates with protein, vegetables, or whole grains.");
    reasons.push("Refined carbohydrate content appears high.");
  }

  if (patterns.diversity_count >= 3) {
    score += 0.5;
    positive.push("Good meal diversity.");
    reasons.push("A variety of foods usually improves nutrient coverage.");
  } else if (patterns.diversity_count === 1) {
    score -= 0.3;
    improve.push("Add one more food group for better meal balance.");
  }

  if (goal === "weight_loss") {
    if (calories <= dailyCalorieTarget * 0.35 && protein >= 15) {
      score += 0.7;
      positive.push("Supports a weight-loss goal with mindful portions.");
    } else {
      score -= 0.4;
      improve.push("For weight loss, reduce portions and add vegetables with lean protein.");
    }
  } else if (goal === "muscle_gain") {
    if (protein >= 25) {
      score += 0.9;
      positive.push("Protein level supports muscle gain.");
    } else {
      score -= 0.5;
      improve.push("For muscle gain, add eggs, paneer, chicken, lentils, chole, or rajma.");
    }
  } else {
    positive.push("Maintain variety and balance across meals.");
  }

  return {
    score: clampScore(score),
    positive_points: uniqueItems(positive).slice(0, 6),
    things_to_improve: uniqueItems(improve).slice(0, 6),
    reasons: uniqueItems(reasons).slice(0, 6),
  };
}

// Mirror of recommendation_engine.build_improvement_simulation estimated score.
export function estimateNewScore(currentScore: number, friedFoodCount: number): number {
  return Math.min(10, Math.round((currentScore + 1.4 + (friedFoodCount ? 0.6 : 0)) * 10) / 10);
}
