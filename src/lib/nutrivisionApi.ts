// NutriVision (Bio1) transport layer.
//
// Talks to the Flask backend through the Vite dev proxy. The frontend uses a
// dedicated `/nutri-api` prefix so it never clashes with the AddiSafe gateway
// that owns `/api/*`; the proxy rewrites `/nutri-api` -> `/api` before the
// request reaches Flask (see vite.config.ts).

export interface UserProfile {
  goal: "weight_loss" | "muscle_gain" | "maintenance";
  daily_calorie_target: number;
  health_profile: string[];
  age: number;
  gender: string;
  height_cm: number;
  weight_kg: number;
  activity_level: string;
}

const NUTRI_BASE = "/nutri-api";

export async function analyzeImage(imageFile: File, userProfile: UserProfile): Promise<any> {
  const formData = new FormData();
  formData.append("image", imageFile);
  formData.append("goal", userProfile.goal);
  formData.append("daily_calorie_target", String(userProfile.daily_calorie_target));
  formData.append("health_profile", JSON.stringify(userProfile.health_profile || []));
  formData.append("age", String(userProfile.age || 30));
  formData.append("gender", userProfile.gender || "not_specified");
  formData.append("height_cm", String(userProfile.height_cm || 170));
  formData.append("weight_kg", String(userProfile.weight_kg || 70));
  formData.append("activity_level", userProfile.activity_level || "moderate");

  let response: Response;
  try {
    response = await fetch(`${NUTRI_BASE}/analyze`, { method: "POST", body: formData });
  } catch {
    throw new Error("Unable to reach the NutriVision backend. Is the Flask server running on port 5000?");
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON response */
  }

  if (!response.ok || !data) {
    throw new Error(data?.error || "Unable to analyze image");
  }
  return data;
}

export async function getGeminiHealth(): Promise<any> {
  try {
    const response = await fetch(`${NUTRI_BASE}/health/gemini`);
    return await response.json();
  } catch {
    return { status: "Failed", reason: "Unable to reach Gemini health endpoint" };
  }
}
