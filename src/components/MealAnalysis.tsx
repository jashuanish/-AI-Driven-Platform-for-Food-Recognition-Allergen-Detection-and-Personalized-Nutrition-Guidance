import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Camera,
  CheckCircle2,
  Droplets,
  Lightbulb,
  Loader2,
  PlusCircle,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  ShoppingBasket,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingUp,
  UploadCloud,
  Utensils,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { analyzeImage, getGeminiHealth, type UserProfile } from "../lib/nutrivisionApi";
import { classifyMeal, estimateNewScore, recomputePatterns, scoreMeal } from "../lib/mealScore";

// ───────────────────────── Shared presentation helpers ─────────────────────

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function DashCard({
  title,
  icon: Icon,
  className = "",
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("bg-card/50 border border-border/80 rounded-[2rem] p-6 shadow-sm backdrop-blur-2xl flex flex-col", className)}>
      <div className="flex items-center gap-2 mb-4 text-muted-foreground">
        {Icon && <Icon className="w-4 h-4" />}
        <h3 className="text-[11px] font-bold uppercase tracking-widest">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ───────────────────────── Local analytics (ported from Bio1 App.jsx) ──────

function scaleValue(value: number, currentCount: number, nextCount: number) {
  return Math.round((value / currentCount) * nextCount * 10) / 10;
}

function sumTotals(items: any[]) {
  return items.reduce(
    (totals, item) => ({
      calories: Math.round((totals.calories + item.calories) * 10) / 10,
      protein_g: Math.round((totals.protein_g + item.protein_g) * 10) / 10,
      carbs_g: Math.round((totals.carbs_g + item.carbs_g) * 10) / 10,
      fat_g: Math.round((totals.fat_g + item.fat_g) * 10) / 10,
      fiber_g: Math.round((totals.fiber_g + item.fiber_g) * 10) / 10,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  );
}

function buildWeeklyAnalytics(history: any[]) {
  if (!history.length) {
    return { average_calories: 0, average_score: 0, best_meal: null, least_balanced_meal: null, weekly_trend: [] };
  }
  const averageCalories = history.reduce((sum, entry) => sum + (entry.calories || 0), 0) / history.length;
  const averageScore = history.reduce((sum, entry) => sum + (entry.score || 0), 0) / history.length;
  return {
    average_calories: Math.round(averageCalories),
    average_score: Math.round(averageScore * 10) / 10,
    best_meal: history.reduce((best, entry) => ((entry.score || 0) > (best?.score || 0) ? entry : best), history[0]),
    least_balanced_meal: history.reduce((lowest, entry) => ((entry.score || 0) < (lowest?.score || 99) ? entry : lowest), history[0]),
    weekly_trend: history.slice(0, 7).map((entry) => ({ date: entry.date, score: entry.score })),
  };
}

function buildDailyProgressFromHistory(history: any[], targets: any, fallbackProgress: any) {
  if (!targets) return fallbackProgress || {};
  const today = new Date().toISOString().slice(0, 10);
  const todayMeals = history.filter((entry) => entry.date === today);
  const consumed = todayMeals.reduce(
    (totals, entry) => {
      const macros = entry.macros || {};
      const micros = entry.micronutrients || {};
      return {
        calories: totals.calories + (entry.calories || macros.calories || 0),
        protein_g: totals.protein_g + (macros.protein_g || 0),
        carbs_g: totals.carbs_g + (macros.carbs_g || 0),
        fat_g: totals.fat_g + (macros.fat_g || 0),
        fiber_g: totals.fiber_g + (macros.fiber_g || 0),
        sugar_g: totals.sugar_g + (micros.sugar_g || 0),
        sodium_mg: totals.sodium_mg + (micros.sodium_mg || 0),
        calcium_mg: totals.calcium_mg + (micros.calcium_mg || 0),
        iron_mg: totals.iron_mg + (micros.iron_mg || 0),
        vitamin_a_mcg: totals.vitamin_a_mcg + (micros.vitamin_a_mcg || 0),
        vitamin_c_mg: totals.vitamin_c_mg + (micros.vitamin_c_mg || 0),
        vitamin_d_mcg: totals.vitamin_d_mcg + (micros.vitamin_d_mcg || 0),
        potassium_mg: totals.potassium_mg + (micros.potassium_mg || 0),
        magnesium_mg: totals.magnesium_mg + (micros.magnesium_mg || 0),
        water_liters: totals.water_liters + (micros.water_liters || 0),
      };
    },
    {
      calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 0,
      calcium_mg: 0, iron_mg: 0, vitamin_a_mcg: 0, vitamin_c_mg: 0, vitamin_d_mcg: 0,
      potassium_mg: 0, magnesium_mg: 0, water_liters: 0,
    },
  );

  return Object.entries(targets).reduce((progress: any, [key, target]: [string, any]) => {
    const current = Math.round(((consumed as any)[key] || 0) * 10) / 10;
    progress[key] = { current, target, percent: Math.min(100, Math.round((current / target) * 100 || 0)) };
    return progress;
  }, {});
}

function buildRemainingFromProgress(progress: any) {
  return Object.entries(progress || {}).reduce((remaining: any, [key, value]: [string, any]) => {
    remaining[key] = {
      consumed: value.current || 0,
      target: value.target || 0,
      remaining: Math.max(0, Math.round(((value.target || 0) - (value.current || 0)) * 10) / 10),
      percent: value.percent || 0,
    };
    return remaining;
  }, {});
}

// ───────────────────────── Container ───────────────────────────────────────

const DEFAULT_PROFILE: UserProfile = {
  goal: "maintenance",
  daily_calorie_target: 2000,
  health_profile: [],
  age: 30,
  gender: "not_specified",
  height_cm: 170,
  weight_kg: 70,
  activity_level: "moderate",
};

export default function MealAnalysis() {
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [result, setResult] = useState<any>(null);
  const [mealHistory, setMealHistory] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("nutrivisionMealHistory") || "[]");
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [geminiHealth, setGeminiHealth] = useState<any>(null);

  useEffect(() => {
    localStorage.setItem("nutrivisionMealHistory", JSON.stringify(mealHistory.slice(0, 20)));
  }, [mealHistory]);

  useEffect(() => {
    let active = true;
    getGeminiHealth().then((health) => {
      if (active) setGeminiHealth(health);
    });
    return () => {
      active = false;
    };
  }, []);

  const enrichedResult = useMemo(() => {
    if (!result) return null;
    const history = mealHistory;
    const dailyProgress = buildDailyProgressFromHistory(history, result.daily_targets, result.daily_progress);
    return {
      ...result,
      meal_history: history.slice(0, 8),
      weekly_analytics: buildWeeklyAnalytics(history),
      daily_progress: dailyProgress,
      today_remaining: buildRemainingFromProgress(dailyProgress),
    };
  }, [mealHistory, result]);

  function handleImageSelect(file: File | null) {
    setImage(file);
    setResult(null);
    setError("");
    if (!file) {
      setImagePreview("");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleAnalyze() {
    if (!image) {
      setError("Please upload a jpg or png meal image first.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await analyzeImage(image, userProfile);
      if (!data.success) throw new Error(data.error || "Analysis failed");
      const historyEntry = data.meal_history_entry ? { ...data.meal_history_entry, image_preview: imagePreview } : null;
      const nextData = historyEntry ? { ...data, meal_history_entry: historyEntry } : data;
      setResult(nextData);
    } catch (analysisError: any) {
      setError(analysisError.message);
    } finally {
      setLoading(false);
    }
  }

  function updateItemCount(foodName: string, nextCount: number) {
    setResult((current: any) => {
      if (!current) return current;
      const items = current.nutrition.items
        .map((item: any) => {
          if (item.food_name !== foodName) return item;
          const currentCount = Math.max(1, item.count);
          const count = Math.max(0, nextCount);
          return {
            ...item,
            count,
            calories: scaleValue(item.calories, currentCount, count),
            protein_g: scaleValue(item.protein_g, currentCount, count),
            carbs_g: scaleValue(item.carbs_g, currentCount, count),
            fat_g: scaleValue(item.fat_g, currentCount, count),
            fiber_g: scaleValue(item.fiber_g, currentCount, count),
          };
        })
        .filter((item: any) => item.count > 0);
      const totals = sumTotals(items);
      return {
        ...current,
        nutrition: { ...current.nutrition, items, totals },
        detected_foods: current.detected_foods
          .map((food: any) => (food.food_name === foodName ? { ...food, count: Math.max(0, nextCount) } : food))
          .filter((food: any) => food.count > 0),
        daily_progress: current.daily_progress
          ? {
              ...current.daily_progress,
              calories: {
                ...current.daily_progress.calories,
                current: totals.calories,
                percent: Math.min(
                  100,
                  Math.round((totals.calories / (current.daily_progress.calories?.target || userProfile.daily_calorie_target)) * 100),
                ),
              },
            }
          : current.daily_progress,
      };
    });
  }

  function addCurrentMealToHistory() {
    if (!result?.meal_history_entry) return;
    const entry = {
      ...result.meal_history_entry,
      calories: result.nutrition.totals.calories,
      macros: result.nutrition.totals,
      micronutrients: result.nutrition.micronutrients || {},
      score: result.meal_rating,
      foods: result.nutrition.items.map((item: any) => `${item.count} ${item.food_name}`),
      image_preview: imagePreview,
    };
    setMealHistory((current) => [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 20));
  }

  function deleteMealFromHistory(mealId: any) {
    setMealHistory((current) => current.filter((entry) => entry.id !== mealId));
  }

  return (
    <main className="max-w-[90rem] mx-auto p-4 md:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left column: profile + image input */}
      <div className="lg:col-span-4 space-y-6 flex flex-col">
        <GeminiStatus health={geminiHealth} />
        <ProfileForm profile={userProfile} onProfileChange={setUserProfile} />
        <ImageUploader imagePreview={imagePreview} file={image} onImageSelect={handleImageSelect} />

        <Button
          onClick={handleAnalyze}
          disabled={loading || !image}
          className="w-full bg-primary text-primary-foreground hover:opacity-90 rounded-2xl h-14 text-sm font-bold tracking-wide uppercase shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
        >
          {loading ? <Loader2 className="w-5 h-5 mr-3 animate-spin" /> : <ScanSearch className="w-5 h-5 mr-3" />}
          {loading ? "Detecting food items..." : "Analyze Meal"}
        </Button>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-2xl flex gap-3 text-sm font-medium backdrop-blur-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </div>

      {/* Right column: results */}
      <div className="lg:col-span-8 flex flex-col">
        {enrichedResult ? (
          <div className="grid gap-6">
            <DetectionResults detectedFoods={enrichedResult.detected_foods} identification={enrichedResult.identification} />
            <NutritionSummary totals={enrichedResult.nutrition.totals} />
            <RecommendationPanel
              data={enrichedResult}
              onAddMeal={addCurrentMealToHistory}
              onDeleteMeal={deleteMealFromHistory}
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {enrichedResult.nutrition.items.map((item: any) => (
                <NutritionCard key={item.food_name} item={item} onCountChange={updateItemCount} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[60vh] p-8 text-center bg-card/10 backdrop-blur-sm rounded-[2.5rem] border border-dashed border-border/60">
            <div className="w-32 h-32 bg-secondary/50 rounded-[2.5rem] flex items-center justify-center mb-8 border border-border/80 shadow-lg shadow-black/5">
              <Utensils className="w-12 h-12 text-muted-foreground/60" />
            </div>
            <h3 className="text-2xl font-black text-foreground tracking-tight">No Meal Analyzed</h3>
            <p className="mt-4 text-sm font-medium text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Upload a meal photo and run the analysis to estimate foods, calories, macros, and practical nutrition guidance.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// ───────────────────────── Gemini status ───────────────────────────────────

function GeminiStatus({ health }: { health: any }) {
  if (!health) {
    return (
      <span className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-card/50 px-3 py-2 text-xs font-semibold text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking Gemini
      </span>
    );
  }
  const connected = health.status === "Connected";
  return (
    <span
      title={health.reason || `${health.sdk || "Gemini"} ${health.model || ""}`}
      className={cn(
        "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold",
        connected
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
      )}
    >
      <Sparkles className="h-4 w-4" />
      {connected ? "Gemini connected" : "Gemini unavailable"}
    </span>
  );
}

// ───────────────────────── Profile form ────────────────────────────────────

const HEALTH_CONDITIONS: [string, string][] = [
  ["diabetes", "Diabetes"],
  ["hypertension", "Hypertension"],
  ["high_cholesterol", "High Cholesterol"],
  ["pcos", "PCOS"],
  ["kidney_disease", "Kidney Disease"],
];

function ProfileForm({ profile, onProfileChange }: { profile: UserProfile; onProfileChange: (p: UserProfile) => void }) {
  function updateProfile(field: keyof UserProfile, value: any) {
    onProfileChange({ ...profile, [field]: field === "daily_calorie_target" ? Number(value) : value });
  }
  function toggleHealthCondition(condition: string) {
    const current = profile.health_profile || [];
    const next = current.includes(condition) ? current.filter((c) => c !== condition) : [...current, condition];
    updateProfile("health_profile", next);
  }

  return (
    <DashCard title="1. Profile" icon={Target}>
      <div className="space-y-4">
        <div>
          <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">Goal</Label>
          <select className={SELECT_CLASS} value={profile.goal} onChange={(e) => updateProfile("goal", e.target.value)}>
            <option value="weight_loss">Weight Loss</option>
            <option value="muscle_gain">Muscle Gain</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>

        <div>
          <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">Daily calorie target</Label>
          <Input
            type="number"
            min={1000}
            max={4000}
            value={profile.daily_calorie_target}
            onChange={(e) => updateProfile("daily_calorie_target", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">Age</Label>
            <Input type="number" min={10} max={100} value={profile.age} onChange={(e) => updateProfile("age", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">Gender</Label>
            <select className={SELECT_CLASS} value={profile.gender} onChange={(e) => updateProfile("gender", e.target.value)}>
              <option value="not_specified">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">Height cm</Label>
            <Input type="number" min={100} max={230} value={profile.height_cm} onChange={(e) => updateProfile("height_cm", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">Weight kg</Label>
            <Input type="number" min={25} max={250} value={profile.weight_kg} onChange={(e) => updateProfile("weight_kg", e.target.value)} />
          </div>
        </div>

        <div>
          <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">Activity level</Label>
          <select className={SELECT_CLASS} value={profile.activity_level} onChange={(e) => updateProfile("activity_level", e.target.value)}>
            <option value="sedentary">Sedentary</option>
            <option value="light">Light</option>
            <option value="moderate">Moderate</option>
            <option value="active">Active</option>
          </select>
        </div>

        <div>
          <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">Health profile</Label>
          <div className="grid gap-2">
            {HEALTH_CONDITIONS.map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2 text-sm font-medium cursor-pointer hover:bg-secondary/60 transition-colors"
              >
                <Checkbox
                  checked={(profile.health_profile || []).includes(value)}
                  onCheckedChange={() => toggleHealthCondition(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </DashCard>
  );
}

// ───────────────────────── Image uploader ──────────────────────────────────

const ACCEPTED_TYPES = ["image/jpeg", "image/png"];

function ImageUploader({
  imagePreview,
  file,
  onImageSelect,
}: {
  imagePreview: string;
  file: File | null;
  onImageSelect: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");

  function selectFile(nextFile?: File | null) {
    setLocalError("");
    if (!nextFile) {
      onImageSelect(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(nextFile.type)) {
      setLocalError("Please choose a jpg or png image.");
      return;
    }
    onImageSelect(nextFile);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  return (
    <DashCard title="2. Meal Image" icon={UploadCloud}>
      <div
        className={cn(
          "border border-dashed rounded-2xl flex flex-col items-center justify-center p-8 min-h-60 text-center transition-all relative group overflow-hidden cursor-pointer",
          dragging ? "border-primary bg-primary/5" : "border-border/80 bg-secondary/50 hover:border-primary/50",
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {imagePreview ? (
          <img src={imagePreview} alt="Meal preview" className="max-h-56 w-auto mx-auto rounded-xl object-contain shadow-sm" />
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-background border border-border/60 flex items-center justify-center mb-4 shadow-sm group-hover:scale-105 transition-all">
              <UploadCloud className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-sm font-semibold">Drag &amp; drop your meal image or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">JPG or PNG, up to 5 MB</p>
          </>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => selectFile(e.target.files?.[0])} />
      <input ref={cameraRef} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" onChange={(e) => selectFile(e.target.files?.[0])} />

      <div className="flex gap-3 mt-4">
        <Button variant="outline" className="flex-1 rounded-xl border-border/60" onClick={() => cameraRef.current?.click()}>
          <Camera className="w-4 h-4 mr-2" /> Capture
        </Button>
        <Button variant="outline" className="flex-1 rounded-xl border-border/60" onClick={() => inputRef.current?.click()}>
          <UploadCloud className="w-4 h-4 mr-2" /> Gallery
        </Button>
      </div>

      {file && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-secondary/50 border border-border/60 p-3">
          <p className="text-xs text-foreground truncate">
            <span className="font-semibold">{file.name}</span> — {(file.size / (1024 * 1024)).toFixed(2)} MB
          </p>
          <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => selectFile(null)}>
            <Trash2 className="h-4 w-4 mr-1" /> Remove
          </Button>
        </div>
      )}

      {localError && <p className="mt-3 text-xs text-destructive font-medium">{localError}</p>}
    </DashCard>
  );
}

// ───────────────────────── Detection results ───────────────────────────────

function confidenceColor(confidence: number) {
  if (confidence > 0.8) return "bg-green-500";
  if (confidence >= 0.6) return "bg-yellow-500";
  return "bg-destructive";
}

// Provenance badge for each detection after the Gemini arbitration layer.
const SOURCE_META: Record<string, { label: string; className: string }> = {
  model_confirmed: { label: "AI Verified", className: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30" },
  model: { label: "Local Model", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  gemini_override: { label: "Gemini Corrected", className: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30" },
  gemini: { label: "Gemini Identified", className: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30" },
  gemini_only: { label: "Gemini Identified", className: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30" },
};

function sourceMeta(source: string) {
  return SOURCE_META[source] || SOURCE_META.model;
}

const DECISION_NOTE: Record<string, string> = {
  model_only: "Gemini was unavailable, so results come from the local model only.",
  confirmed: "Gemini reviewed and confirmed the local model's detections.",
  reconciled: "Gemini corrected one or more of the local model's detections.",
  gemini_only: "The local model did not recognize this — Gemini identified it instead.",
};

function DetectionResults({ detectedFoods, identification }: { detectedFoods: any[]; identification?: any }) {
  // Gemini decided the image is not a recognizable food item.
  if (identification?.decision === "not_food") {
    return (
      <DashCard title="Detected Food Items" icon={ScanSearch}>
        <div className="flex gap-3 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 text-orange-700 dark:text-orange-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-bold">Not a food item</p>
            <p className="mt-1 text-sm leading-6">
              {identification.notFoodReason ||
                "Gemini determined this image does not contain a recognizable food item."}
            </p>
          </div>
        </div>
      </DashCard>
    );
  }

  const note = identification?.decision ? DECISION_NOTE[identification.decision] : undefined;

  return (
    <DashCard title="Detected Food Items" icon={ScanSearch}>
      {detectedFoods.length === 0 ? (
        <p className="text-sm text-muted-foreground">No food items were detected above the configured confidence threshold.</p>
      ) : (
        <>
          {note && (
            <p className="mb-4 flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
              {note}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {detectedFoods.map((food, index) => {
              const confidencePercent = Math.round((food.confidence || 0) * 100);
              const meta = sourceMeta(food.source);
              const hasModel = food.model_confidence != null;
              const hasGemini = food.gemini_confidence != null;
              return (
                <div key={`${food.food_name}-${index}`} className="rounded-2xl border border-border/60 bg-secondary/40 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h4 className="text-sm font-bold text-foreground">{food.food_name}</h4>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">x{food.count}</span>
                  </div>
                  <span className={cn("mb-3 inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", meta.className)}>
                    {meta.label}
                  </span>
                  <div className="mb-2 flex justify-between text-xs font-medium text-muted-foreground">
                    <span>Confidence</span>
                    <span>{confidencePercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full", confidenceColor(food.confidence || 0))} style={{ width: `${confidencePercent}%` }} />
                  </div>
                  {(hasModel || hasGemini) && (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
                      {hasModel && <span>Model {Math.round(food.model_confidence * 100)}%</span>}
                      {hasGemini && <span>Gemini {Math.round(food.gemini_confidence * 100)}%</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </DashCard>
  );
}

// ───────────────────────── Nutrition summary ───────────────────────────────

const MACRO_COLORS: Record<string, string> = { protein_g: "#2563eb", carbs_g: "#f97316", fat_g: "#dc2626" };

function NutritionSummary({ totals }: { totals: any }) {
  const chartData = [
    { name: "Protein", value: totals.protein_g, key: "protein_g" },
    { name: "Carbs", value: totals.carbs_g, key: "carbs_g" },
    { name: "Fat", value: totals.fat_g, key: "fat_g" },
  ].filter((item) => item.value > 0);

  return (
    <DashCard title="Nutrition Summary" icon={BarChart3}>
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <div className="flex flex-col items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 p-5">
          <span className="text-5xl font-black text-primary">{Math.round(totals.calories)}</span>
          <span className="mt-1 text-xs font-bold uppercase tracking-widest text-primary">Calories</span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                {chartData.map((entry) => (
                  <Cell key={entry.key} fill={MACRO_COLORS[entry.key]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any) => `${value}g`}
                contentStyle={{ borderRadius: "12px", border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", fontSize: "12px", fontWeight: "bold" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatBox label="Protein" value={totals.protein_g} className="border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400" />
        <StatBox label="Carbs" value={totals.carbs_g} className="border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400" />
        <StatBox label="Fat" value={totals.fat_g} className="border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400" />
        <StatBox label="Fiber" value={totals.fiber_g} className="border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400" />
      </div>
    </DashCard>
  );
}

function StatBox({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={cn("rounded-2xl border p-4", className)}>
      <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}g</p>
    </div>
  );
}

// ───────────────────────── Per-item nutrition card ─────────────────────────

const DAILY_VALUES: Record<string, number> = { protein_g: 50, carbs_g: 300, fat_g: 65, fiber_g: 25 };
const MACRO_LABELS: Record<string, string> = { protein_g: "Protein", carbs_g: "Carbs", fat_g: "Fat", fiber_g: "Fiber" };
const MACRO_BARS: Record<string, string> = { protein_g: "bg-blue-600", carbs_g: "bg-orange-500", fat_g: "bg-red-600", fiber_g: "bg-green-600" };

function NutritionCard({ item, onCountChange }: { item: any; onCountChange: (food: string, count: number) => void }) {
  const servingLabel = item.count === 1 ? item.serving_unit : `${item.serving_unit}s`;
  return (
    <div className="rounded-[2rem] border border-border/80 bg-card/50 p-6 shadow-sm backdrop-blur-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-bold text-foreground">{item.food_name}</h4>
          <p className="text-xs text-muted-foreground">{item.count} {servingLabel}</p>
          <div className="mt-3 inline-flex items-center rounded-xl border border-border/60 bg-secondary/40">
            <button
              type="button"
              onClick={() => onCountChange(item.food_name, item.count - 1)}
              className="flex h-9 w-9 items-center justify-center text-lg font-semibold text-foreground hover:bg-secondary"
              aria-label={`Decrease ${item.food_name}`}
            >
              −
            </button>
            <span className="flex h-9 min-w-10 items-center justify-center border-x border-border/60 px-3 text-sm font-bold text-foreground">{item.count}</span>
            <button
              type="button"
              onClick={() => onCountChange(item.food_name, item.count + 1)}
              className="flex h-9 w-9 items-center justify-center text-lg font-semibold text-foreground hover:bg-secondary"
              aria-label={`Increase ${item.food_name}`}
            >
              +
            </button>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-primary">{Math.round(item.calories)}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">cal</p>
        </div>
      </div>
      <div className="space-y-3">
        {Object.keys(DAILY_VALUES).map((key) => {
          const percent = Math.min(100, Math.round((item[key] / DAILY_VALUES[key]) * 100));
          return (
            <div key={key}>
              <div className="mb-1 flex justify-between text-xs font-medium text-muted-foreground">
                <span>{MACRO_LABELS[key]}</span>
                <span>{item[key]}g / {percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full", MACRO_BARS[key])} style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── Recommendation panel ────────────────────────────

function ratingClass(rating: number) {
  if (rating >= 7) return "border-green-500 text-green-600 dark:text-green-400";
  if (rating >= 4) return "border-yellow-500 text-yellow-600 dark:text-yellow-400";
  return "border-destructive text-destructive";
}

function recommendationIcon(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("low") || lower.includes("high") || lower.includes("fried")) return <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />;
  if (lower.includes("good") || lower.includes("balanced") || lower.includes("contains")) return <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />;
  return <Lightbulb className="h-5 w-5 shrink-0 text-blue-500" />;
}

function RecommendationPanel({ data, onAddMeal, onDeleteMeal }: { data: any; onAddMeal: () => void; onDeleteMeal: (id: any) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
      {/* Score column */}
      <DashCard title="Meal Score" icon={Star}>
        <div className={cn("mx-auto mb-4 flex h-36 w-36 flex-col items-center justify-center rounded-full border-8 bg-secondary/30", ratingClass(data.meal_rating))}>
          <Star className="mb-1 h-6 w-6" />
          <span className="text-4xl font-black">{data.meal_rating}</span>
          <span className="text-xs font-bold">out of 10</span>
        </div>
        {data.meal_category && <h4 className="text-center text-base font-bold text-foreground">{data.meal_category}</h4>}
        {data.category_summary && <p className="mt-2 text-center text-sm leading-6 text-muted-foreground">{data.category_summary}</p>}
        {data.confidence && (
          <div className="mt-4 grid gap-2">
            <MiniStat label="Detection confidence" value={`${data.confidence.food_detection_confidence || 0}%`} />
            <MiniStat label="Nutrition confidence" value={`${data.confidence.nutrition_confidence || 0}%`} />
          </div>
        )}
        <Button onClick={onAddMeal} className="mt-4 w-full rounded-xl h-10">
          <PlusCircle className="h-4 w-4 mr-2" /> Add to Today's Intake
        </Button>
      </DashCard>

      {/* Detail grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DashCard title="Food Safety" icon={ShieldAlert} className="lg:col-span-2">
          <FoodSafety safety={data.food_safety} gemini={data.gemini_analysis} />
        </DashCard>

        {data.overall_assessment && (
          <DashCard title="Overall Assessment" icon={Sparkles} className="lg:col-span-2">
            <p className="text-sm leading-6 text-foreground/80">{data.overall_assessment}</p>
          </DashCard>
        )}

        <DashCard title="Why This Score" icon={Lightbulb}>
          <IconList items={data.recommendations} iconFor={recommendationIcon} />
        </DashCard>

        <DashCard title="Positive Points" icon={CheckCircle2}>
          <PillList items={data.positive_points} tone="green" />
        </DashCard>

        <DashCard title="Things to Improve" icon={AlertTriangle}>
          <PillList items={data.things_to_improve} tone="amber" />
        </DashCard>

        <DashCard title="Health Warnings" icon={ShieldAlert}>
          <ObjectList items={data.health_warnings} titleKey="label" bodyKey="message" empty="No special alerts for this meal." tone="red" />
        </DashCard>

        <DashCard title="Healthier Alternatives" icon={RefreshCw}>
          <ObjectList items={data.healthier_alternatives} titleKey="suggestion" bodyKey="why" empty="No swaps needed right now." tone="purple" />
        </DashCard>

        <DashCard title="Improve My Meal" icon={TrendingUp}>
          <ImproveMeal simulation={data.meal_improvement_simulation} />
        </DashCard>

        <DashCard title="Missing Nutrients" icon={BarChart3}>
          <MissingNutrients items={data.missing_nutrients} />
        </DashCard>

        <DashCard title="Meal Balance" icon={BarChart3}>
          <BalanceBars data={data.meal_balance} />
        </DashCard>

        <DashCard title="Daily Goal Progress" icon={TrendingUp}>
          <BalanceBars data={data.daily_progress} />
        </DashCard>

        <DashCard title="Remaining Nutrition" icon={BarChart3}>
          <RemainingNutrition data={data.today_remaining} />
        </DashCard>

        <DashCard title="Today's Summary" icon={Sparkles}>
          <PillList items={data.daily_summary} tone="emerald" />
        </DashCard>

        <DashCard title="Likely Ingredients" icon={Utensils}>
          <IngredientBreakdown items={data.ingredient_breakdown} />
        </DashCard>

        <DashCard title="Allergy Notes" icon={ShieldAlert}>
          <ObjectList items={data.allergy_warnings} titleKey="allergen" bodyKey="food_name" empty="No common allergen notes from detected foods." tone="red" />
        </DashCard>

        <DashCard title="Goal-Based Advice" icon={Star}>
          <PillList items={data.goal_advice} tone="emerald" />
        </DashCard>

        <DashCard title="Hydration" icon={Droplets}>
          {data.hydration ? (
            <p className="text-sm leading-6 text-foreground/80">
              Aim for about <span className="font-semibold">{data.hydration.daily_water_liters}L</span> today. {data.hydration.message}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Hydration guidance will appear after analysis.</p>
          )}
        </DashCard>

        <DashCard title="Grocery Suggestions" icon={ShoppingBasket}>
          <PillList items={data.grocery_suggestions} tone="emerald" />
        </DashCard>

        <DashCard title="Meal History" icon={Utensils}>
          <MealHistory history={data.meal_history} onDeleteMeal={onDeleteMeal} />
        </DashCard>

        <DashCard title="Weekly Analytics" icon={BarChart3}>
          <WeeklyAnalytics analytics={data.weekly_analytics} />
        </DashCard>

        {data.nutrition_tip && (
          <DashCard title="Educational Tip" icon={Lightbulb} className="lg:col-span-2">
            <p className="text-sm leading-6 text-blue-600 dark:text-blue-400">{data.nutrition_tip}</p>
          </DashCard>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground">{value}</span>
    </div>
  );
}

function FoodSafety({ safety, gemini }: { safety: any; gemini: any }) {
  if (!safety) return <p className="text-sm text-muted-foreground">Food-safety analysis will appear after analysis.</p>;
  const facts: [string, string][] = [
    ["Freshness", safety.freshness || "Unknown"],
    ["Cooking style", safety.cooking_style || "Unknown"],
    ["Oil level", safety.oil_level || "Unknown"],
    ["Portion", safety.portion_estimate || "Unknown"],
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border/60 bg-secondary/30 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold leading-6 text-foreground">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 rounded-xl border border-border/60 bg-secondary/30 p-4 text-sm leading-6 text-foreground/80">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Safety note</p>
          <p>{safety.food_safety || safety.quality_summary}</p>
        </div>
        {safety.quality_summary && safety.quality_summary !== safety.food_safety && (
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Quality summary</p>
            <p>{safety.quality_summary}</p>
          </div>
        )}
        {!gemini?.enabled && (
          <p className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-3 text-orange-600 dark:text-orange-400">
            {gemini?.disabledReason || gemini?.foodSafety || "Gemini Vision is disabled, so visual food-safety analysis was not performed."}
          </p>
        )}
        {safety.visual_insights?.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Visual observations</p>
            <ul className="grid gap-2">
              {safety.visual_insights.map((insight: string) => (
                <li key={insight} className="rounded-lg bg-card/60 border border-border/40 p-3">{insight}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {safety.alerts?.map((alert: string) => (
        <p key={alert} className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-3 text-sm leading-6 text-orange-600 dark:text-orange-400">{alert}</p>
      ))}
    </div>
  );
}

function IconList({ items, iconFor }: { items: string[]; iconFor: (t: string) => React.ReactNode }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">Score reasons will appear after analysis.</p>;
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 rounded-xl bg-secondary/40 p-3 text-sm leading-6 text-foreground/80">
          {iconFor(item)}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const PILL_TONES: Record<string, string> = {
  green: "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400",
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  purple: "border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-400",
  emerald: "border-primary/20 bg-primary/10 text-primary",
};

function PillList({ items, tone }: { items: string[]; tone: string }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">No items to show.</p>;
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item} className={cn("rounded-xl border p-3 text-sm leading-6", PILL_TONES[tone])}>{item}</li>
      ))}
    </ul>
  );
}

const OBJ_TONES: Record<string, string> = {
  red: "border-destructive/20 bg-destructive/10 text-destructive",
  purple: "border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-400",
};

function ObjectList({ items, titleKey, bodyKey, empty, tone }: { items: any[]; titleKey: string; bodyKey: string; empty: string; tone: string }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {items.map((item, index) => (
        <li key={`${item[titleKey]}-${index}`} className={cn("rounded-xl border p-3 text-sm", OBJ_TONES[tone])}>
          <p className="font-semibold">{item[titleKey]}</p>
          <p className="mt-1 leading-6">{item[bodyKey]}</p>
        </li>
      ))}
    </ul>
  );
}

function ImproveMeal({ simulation }: { simulation: any }) {
  if (!simulation?.current_score) return <p className="text-sm text-muted-foreground">Improvement ideas will appear after analysis.</p>;
  return (
    <div className="grid gap-3 text-sm text-foreground/80">
      <div className="flex justify-between rounded-xl bg-secondary/40 p-3">
        <span>Current score</span>
        <span className="font-semibold">{simulation.current_score}</span>
      </div>
      <ul className="grid gap-2">
        {simulation.suggested_changes.map((change: string) => (
          <li key={change} className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-primary">{change}</li>
        ))}
      </ul>
      <div className="flex justify-between rounded-xl bg-green-500/10 border border-green-500/20 p-3 text-green-700 dark:text-green-400">
        <span>Estimated new score</span>
        <span className="font-semibold">{simulation.estimated_new_score}</span>
      </div>
    </div>
  );
}

function MissingNutrients({ items }: { items: any[] }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">No obvious missing nutrients detected.</p>;
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item.nutrient} className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-3 text-sm text-orange-700 dark:text-orange-400">
          <p className="font-semibold">{item.nutrient}</p>
          <p className="mt-1">{item.foods.join(", ")}</p>
        </li>
      ))}
    </ul>
  );
}

const BALANCE_LABELS: Record<string, string> = { calories: "Calories", protein_g: "Protein", carbs_g: "Carbs", fat_g: "Fat", fiber_g: "Fiber" };

function BalanceBars({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <p className="text-sm text-muted-foreground">Progress will appear after analysis.</p>;
  return (
    <div className="grid gap-3">
      {Object.entries(data).map(([key, value]: [string, any]) => (
        <div key={key}>
          <div className="mb-1 flex justify-between text-xs font-medium text-muted-foreground">
            <span>{BALANCE_LABELS[key] || key}</span>
            <span>{value.current ?? value.value} / {value.target}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${value.percent || 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const REMAIN_LABELS: Record<string, string> = {
  calories: "Calories", protein_g: "Protein", carbs_g: "Carbs", fat_g: "Fat", fiber_g: "Fiber", sugar_g: "Sugar",
  sodium_mg: "Sodium", calcium_mg: "Calcium", iron_mg: "Iron", vitamin_a_mcg: "Vitamin A", vitamin_c_mg: "Vitamin C",
  vitamin_d_mcg: "Vitamin D", potassium_mg: "Potassium", magnesium_mg: "Magnesium", water_liters: "Water",
};

function RemainingNutrition({ data }: { data: any }) {
  if (!data || Object.keys(data).length === 0) return <p className="text-sm text-muted-foreground">Remaining nutrition will appear after analysis.</p>;
  return (
    <div className="grid gap-2">
      {Object.entries(data).map(([key, value]: [string, any]) => (
        <div key={key} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-secondary/40 p-2 text-sm">
          <span className="text-foreground/80">{REMAIN_LABELS[key] || key}</span>
          <span className="font-semibold text-foreground">{value.remaining} left</span>
        </div>
      ))}
    </div>
  );
}

function IngredientBreakdown({ items }: { items: any[] }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">Ingredient notes will appear after foods are detected.</p>;
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item.food_name} className="rounded-xl bg-secondary/40 p-3 text-sm text-foreground/80">
          <p className="font-semibold text-foreground">{item.food_name}</p>
          <p className="mt-1">{item.likely_ingredients.join(", ")}</p>
        </li>
      ))}
    </ul>
  );
}

function MealHistory({ history, onDeleteMeal }: { history: any[]; onDeleteMeal: (id: any) => void }) {
  if (!history?.length) return <p className="text-sm text-muted-foreground">Meal history will start after analysis.</p>;
  return (
    <ul className="grid gap-2">
      {history.slice(0, 4).map((entry) => (
        <li key={entry.id} className="rounded-xl bg-secondary/40 p-3 text-sm text-foreground/80">
          <div className="flex items-center justify-between gap-3">
            <span>{entry.meal_type} | {entry.date}</span>
            <span className="font-semibold">{entry.calories} cal | {entry.score}/10</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="truncate text-xs text-muted-foreground">{entry.foods?.join(", ")}</span>
            <Button variant="ghost" size="sm" className="rounded-lg text-destructive hover:bg-destructive/10" onClick={() => onDeleteMeal(entry.id)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function WeeklyAnalytics({ analytics }: { analytics: any }) {
  if (!analytics) return <p className="text-sm text-muted-foreground">Weekly analytics will appear after analyses.</p>;
  return (
    <div className="grid gap-2">
      <MiniStat label="Average calories" value={analytics.average_calories || 0} />
      <MiniStat label="Average score" value={analytics.average_score || 0} />
      <MiniStat label="Best meal" value={analytics.best_meal ? `${analytics.best_meal.score}/10` : "None"} />
    </div>
  );
}
