import os
import json
from pathlib import Path

from flask import Blueprint, jsonify, request
from PIL import Image, UnidentifiedImageError

from config import MAX_IMAGE_SIZE_MB
from services.detector import DetectorError, detect_foods
from services.food_safety import build_food_safety_panel, portion_multiplier
from services.gemini_service import (
    analyze_and_identify,
    test_food_image,
    validate_gemini_connection,
)
from services.identification import reconcile_foods
from services.goal_service import build_daily_targets
from services.meal_tracker import build_daily_summary, build_remaining, estimate_micronutrients
from services.nutrition import calculate_nutrition
from services.recommendation import generate_recommendation


analyze_bp = Blueprint("analyze", __name__)
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png"}
TEMP_UPLOAD_PATH = Path("/tmp/nutrivision_upload.jpg")


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@analyze_bp.route("/analyze", methods=["POST"])
def analyze_meal():
    temp_path = TEMP_UPLOAD_PATH
    try:
        if "image" not in request.files:
            return jsonify({"success": False, "error": "Image file is required"}), 400

        image = request.files["image"]
        if not image.filename:
            return jsonify({"success": False, "error": "Image file is required"}), 400
        if not allowed_file(image.filename):
            return jsonify({"success": False, "error": "Only jpg and png files are supported"}), 400

        image.seek(0, os.SEEK_END)
        image_size_mb = image.tell() / (1024 * 1024)
        image.seek(0)
        if image_size_mb > MAX_IMAGE_SIZE_MB:
            return jsonify({"success": False, "error": f"Image must be under {MAX_IMAGE_SIZE_MB} MB"}), 400

        goal = request.form.get("goal", "maintenance")
        if goal not in {"weight_loss", "muscle_gain", "maintenance"}:
            return jsonify({"success": False, "error": "Invalid goal"}), 400

        calorie_target = request.form.get("daily_calorie_target") or request.form.get("dailyCalories") or 2000
        try:
            daily_calorie_target = int(calorie_target)
        except ValueError:
            return jsonify({"success": False, "error": "Daily calorie target must be a number"}), 400
        if daily_calorie_target < 1:
            return jsonify({"success": False, "error": "Daily calorie target must be positive"}), 400
        health_profile_raw = request.form.get("health_profile", "[]")
        try:
            health_profile = json.loads(health_profile_raw) if health_profile_raw else []
        except json.JSONDecodeError:
            health_profile = []

        temp_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            image.save(temp_path)
            with Image.open(temp_path) as uploaded_image:
                uploaded_image.verify()
        except (UnidentifiedImageError, OSError):
            return jsonify({"success": False, "error": "Uploaded file is not a valid image"}), 400

        try:
            detected_foods = detect_foods(str(temp_path))
        except DetectorError as error:
            return jsonify({"success": False, "error": str(error)}), 500

        # Second layer: one Gemini call reviews the same image plus the local
        # model's candidate labels, returning both the quality/safety analysis
        # and an identification verdict used to arbitrate the final food list.
        gemini_result = analyze_and_identify(
            str(temp_path), [food.get("food_name") for food in detected_foods]
        )
        gemini_analysis = gemini_result["analysis"]
        gemini_identification = gemini_result["identification"]
        detected_foods, identification = reconcile_foods(detected_foods, gemini_identification)

        nutrition = calculate_nutrition(detected_foods)
        gemini_status = {
            "sdk": "google-genai",
            "apiKeyLoaded": gemini_analysis.get("errorType") != "MissingApiKey",
            "model": gemini_analysis.get("model"),
            "status": "Connected" if gemini_analysis.get("enabled") else "Failed",
            "reason": gemini_analysis.get("disabledReason", ""),
            "errorType": gemini_analysis.get("errorType", ""),
        }
        food_safety = build_food_safety_panel(gemini_analysis)
        multiplier = portion_multiplier(gemini_analysis.get("portionEstimate"))
        if multiplier != 1.0 and nutrition["items"]:
            nutrition = scale_nutrition(nutrition, multiplier)
        micronutrients = estimate_micronutrients(nutrition["items"], nutrition["totals"])
        full_totals = {**nutrition["totals"], **micronutrients}
        user_profile = {
            "goal": goal,
            "daily_calorie_target": daily_calorie_target,
            "health_profile": health_profile,
            "age": int(request.form.get("age", 30) or 30),
            "gender": request.form.get("gender", "not_specified"),
            "height_cm": float(request.form.get("height_cm", 170) or 170),
            "weight_kg": float(request.form.get("weight_kg", 70) or 70),
            "activity_level": request.form.get("activity_level", "moderate"),
        }
        daily_targets = build_daily_targets(user_profile)
        today_remaining = build_remaining(full_totals, daily_targets)
        daily_summary = build_daily_summary(today_remaining)
        recommendation = generate_recommendation(
            full_totals,
            user_profile,
            nutrition["items"],
            detected_foods,
        )

        return jsonify(
            {
                "success": True,
                "detected_foods": detected_foods,
                "nutrition": {**nutrition, "micronutrients": micronutrients, "full_totals": full_totals},
                "recommendations": recommendation["recommendations"],
                "meal_rating": recommendation["meal_rating"],
                "meal_category": recommendation["meal_category"],
                "category_summary": recommendation["category_summary"],
                "overall_assessment": recommendation["overall_assessment"],
                "positive_points": recommendation["positive_points"],
                "things_to_improve": recommendation["things_to_improve"],
                "healthier_alternatives": recommendation["healthier_alternatives"],
                "meal_improvement_simulation": recommendation["meal_improvement_simulation"],
                "missing_nutrients": recommendation["missing_nutrients"],
                "goal_advice": recommendation["goal_advice"],
                "nutrition_tip": recommendation["nutrition_tip"],
                "meal_balance": recommendation["meal_balance"],
                "daily_progress": recommendation["daily_progress"],
                "meal_history_entry": recommendation["meal_history_entry"],
                "meal_history": recommendation["meal_history"],
                "weekly_analytics": recommendation["weekly_analytics"],
                "ingredient_breakdown": recommendation["ingredient_breakdown"],
                "health_warnings": recommendation["health_warnings"],
                "allergy_warnings": recommendation["allergy_warnings"],
                "hydration": recommendation["hydration"],
                "grocery_suggestions": recommendation["grocery_suggestions"],
                "confidence": recommendation["confidence"],
                "identification": identification,
                "food_identification": gemini_identification,
                "foodIdentification": gemini_identification,
                "gemini_analysis": gemini_analysis,
                "geminiAnalysis": gemini_analysis,
                "gemini_status": gemini_status,
                "geminiStatus": gemini_status,
                "food_safety": food_safety,
                "foodSafety": food_safety,
                "daily_targets": daily_targets,
                "dailyTargets": daily_targets,
                "today_remaining": today_remaining,
                "todayRemaining": today_remaining,
                "daily_summary": daily_summary,
                "dailySummary": daily_summary,
                "score_factors": recommendation["score_factors"],
                "foods": detected_foods,
                "mealScore": {
                    "score": recommendation["meal_rating"],
                    "category": recommendation["meal_category"],
                    "summary": recommendation["category_summary"],
                },
                "mealCategory": recommendation["meal_category"],
                "overallAssessment": recommendation["overall_assessment"],
                "positivePoints": recommendation["positive_points"],
                "improvements": recommendation["things_to_improve"],
                "healthWarnings": recommendation["health_warnings"],
                "healthierAlternatives": recommendation["healthier_alternatives"],
                "mealImprovementSimulation": recommendation["meal_improvement_simulation"],
                "missingNutrients": recommendation["missing_nutrients"],
                "goalAdvice": recommendation["goal_advice"],
                "nutritionTip": recommendation["nutrition_tip"],
                "dailyProgress": recommendation["daily_progress"],
                "mealHistory": recommendation["meal_history"],
                "weeklyAnalytics": recommendation["weekly_analytics"],
            }
        )
    except Exception as error:
        return jsonify({"success": False, "error": str(error)}), 500
    finally:
        if temp_path.exists():
            temp_path.unlink()


@analyze_bp.route("/health/gemini", methods=["GET"])
def gemini_health():
    include_exception = request.args.get("debug") == "true"
    status = validate_gemini_connection(include_exception=include_exception)
    http_status = 200 if status.get("status") == "Connected" else 503
    return jsonify(status), http_status


@analyze_bp.route("/test/gemini", methods=["POST"])
def test_gemini_image():
    temp_path = Path("/tmp/nutrivision_gemini_test.jpg")
    try:
        if "image" not in request.files:
            return jsonify({"success": False, "error": "Image file is required"}), 400
        image = request.files["image"]
        if not image.filename:
            return jsonify({"success": False, "error": "Image file is required"}), 400
        if not allowed_file(image.filename):
            return jsonify({"success": False, "error": "Only jpg and png files are supported"}), 400

        temp_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            image.save(temp_path)
            with Image.open(temp_path) as uploaded_image:
                uploaded_image.verify()
        except (UnidentifiedImageError, OSError):
            return jsonify({"success": False, "error": "Uploaded file is not a valid image"}), 400

        return jsonify(test_food_image(str(temp_path)))
    finally:
        if temp_path.exists():
            temp_path.unlink()


def scale_nutrition(nutrition, multiplier):
    items = []
    for item in nutrition["items"]:
        scaled = item.copy()
        for key in ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"]:
            scaled[key] = round(scaled.get(key, 0) * multiplier, 1)
        items.append(scaled)

    totals = {key: 0 for key in ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"]}
    for item in items:
        for key in totals:
            totals[key] = round(totals[key] + item.get(key, 0), 1)
    return {"items": items, "totals": totals}
