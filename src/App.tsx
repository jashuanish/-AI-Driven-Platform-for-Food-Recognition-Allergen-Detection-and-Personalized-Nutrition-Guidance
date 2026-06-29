import React, { useState, useRef, useEffect, useMemo } from "react";
import Markdown from "react-markdown";
import { scanFoodLabel } from "./lib/openrouter";
import { Shield, UploadCloud, FileText, Camera, Loader2, AlertCircle, Sun, Moon, CheckCircle, AlertTriangle, XCircle, Info, HeartPulse, Stethoscope, Carrot, ArrowRight, Plus, Trash2, Edit2, FlaskConical, ScanLine, Utensils } from "lucide-react";
import AddiSafeDashboard from "./components/AddiSafeDashboard";
import InteractionReport from "./components/InteractionReport";
import MealAnalysis from "./components/MealAnalysis";
import { detectAdditives, findAdditive, computeRisk, type Additive } from "./lib/additives";
import { parseModelJson } from "./lib/jsonRepair";

interface HealthProfile {
  id: string;
  name: string;
  selectedIds: string[];
}
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import AdisenseLogo from "./components/AdisenseLogo";

interface ReportData {
  allergySafety: {
    profile: string;
    stopBanner: string | null;
    items: {
      severity: "CRITICAL" | "HIGH" | "CAUTION" | "CLEAR";
      allergen: string;
      reason: string;
    }[];
  };
  snapshot: {
    name: string;
    brand: string;
    variant: string;
    servingSize: string;
    servingsPerPack: string;
    netWeight: string;
    demographic: string;
    country: string;
  };
  ingredients: {
    name: string;
    function: string;
    status: "SAFE" | "CAUTION" | "FLAG";
    note: string;
    allergenMatch: boolean;
  }[];
  additivesDetected?: {
    name: string;
    eCode: string | null;
    labelText: string;
  }[];
  nutrition: {
    nutrient: string;
    per100g: string;
    perServing: string;
    rdiPercent: number;
    status: "WITHIN LIMITS" | "APPROACHING LIMIT" | "EXCEEDS LIMIT";
  }[];
  healthScore: {
    total: number;
    verdict: string;
    dimensions: { name: string; score: number; max: number }[];
  };
  healthFlags: {
    profile: string;
    risk: string;
    action: string;
  }[];
  alternatives: {
    product: string;
    why: string;
    allergenNote: string;
    difficulty: "Easy" | "Moderate" | "Lifestyle change";
  }[];
  diyAlternative: string;
  bottomLine: string;
}

const ALLERGEN_CATEGORIES = [
  { id: "arachis", label: "Peanuts (Arachis)" },
  { id: "treenuts", label: "Tree Nuts (Almond, Walnut, etc)" },
  { id: "shellfish", label: "Shellfish / Crustaceans" },
  { id: "fish", label: "Fish" },
  { id: "milk", label: "Milk / Dairy" },
  { id: "eggs", label: "Eggs" },
  { id: "soy", label: "Soy" },
  { id: "wheat", label: "Wheat / Gluten" },
  { id: "sesame", label: "Sesame" },
  { id: "mustard", label: "Mustard" },
  { id: "sulphites", label: "Sulphites" }
];

const INTOLERANCES = [
  { id: "lactose", label: "Lactose Intolerance" },
  { id: "fructose", label: "Fructose / FODMAP" },
  { id: "histamine", label: "Histamine" },
  { id: "msg", label: "MSG Sensitivity" },
  { id: "aspartame", label: "Artificial Sweeteners" },
  { id: "nightshades", label: "Nightshades" }
];

const DIETARY = [
  { id: "vegan", label: "Vegan" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "jain", label: "Jain" },
  { id: "halal", label: "Halal" },
  { id: "kosher", label: "Kosher" }
];

const CONDITIONS = [
  { id: "diabetes", label: "Diabetic / Pre-diabetic" },
  { id: "hypertension", label: "Hypertension / Cardiac Risk" },
  { id: "pregnancy", label: "Pregnant / Breastfeeding" }
];

const BentoCard = ({ title, children, className = "", icon: Icon }: any) => (
  <div className={`bg-card/50 border border-border/80 rounded-[2rem] p-6 shadow-sm backdrop-blur-2xl flex flex-col ${className}`}>
    <div className="flex items-center gap-2 mb-4 text-muted-foreground">
      {Icon && <Icon className="w-4 h-4" />}
      <h3 className="text-[11px] font-bold uppercase tracking-widest">{title}</h3>
    </div>
    {children}
  </div>
);

function LandingPage({ onGetStarted }: { onGetStarted: () => void }) {
  return (
  <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.12),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.16),_transparent_32%),linear-gradient(135deg,_rgba(247,251,249,0.99),_rgba(239,248,243,0.96))] dark:bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.05),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.03),_transparent_35%),linear-gradient(135deg,_rgba(5,5,5,0.99),_rgba(16,16,16,0.97))]" />
    <div className="absolute top-10 left-10 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
    <div className="absolute bottom-10 right-10 w-[28rem] h-[28rem] bg-secondary/70 rounded-full blur-3xl pointer-events-none"></div>

        <div className="max-w-3xl text-center z-10 w-full">
      <AdisenseLogo stacked showWordmark className="w-28 sm:w-36 text-primary mb-8" />
            
      <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-6 text-foreground drop-shadow-sm leading-tight">
                Decode your food. <br/>
        <span className="text-primary">Protect your health.</span>
            </h1>
            
      <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed font-medium">
                Scan nutrition labels instantly. We cross-reference regulations and your personal health profile to detect hidden allergens and risky ingredients.
            </p>
            
        <Button size="lg" onClick={onGetStarted} className="rounded-full px-8 h-14 text-base font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90">
                Get Started
                <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            
            <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 pt-10 border-t border-border/50 max-w-3xl mx-auto text-left">
                <div className="flex flex-col gap-3 p-4 bg-card/50 rounded-2xl border border-border/50 backdrop-blur-sm">
                   <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Shield className="w-5 h-5 text-primary" /></div>
                   <h3 className="font-bold text-sm">Allergen Safety</h3>
                </div>
                <div className="flex flex-col gap-3 p-4 bg-card/50 rounded-2xl border border-border/50 backdrop-blur-sm">
                   <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><HeartPulse className="w-5 h-5 text-primary" /></div>
                   <h3 className="font-bold text-sm">Health Diagnostics</h3>
                </div>
                <div className="flex flex-col gap-3 p-4 bg-card/50 rounded-2xl border border-border/50 backdrop-blur-sm">
                   <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><FileText className="w-5 h-5 text-primary" /></div>
                   <h3 className="font-bold text-sm">Ingredient Deep Dive</h3>
                </div>
                <div className="flex flex-col gap-3 p-4 bg-card/50 rounded-2xl border border-border/50 backdrop-blur-sm">
                   <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Carrot className="w-5 h-5 text-primary" /></div>
                   <h3 className="font-bold text-sm">Healthy Swaps</h3>
                </div>
            </div>
        </div>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<"landing" | "app">("landing");
  const [mode, setMode] = useState<"scanner" | "lab" | "meal">("scanner");
  const [labAdditiveIds, setLabAdditiveIds] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<HealthProfile[]>(() => {
    try {
      const saved = localStorage.getItem("healthProfiles");
      if (saved) return JSON.parse(saved);
    } catch (e) { /* ignore */ }
    return [{ id: '1', name: 'My Profile', selectedIds: [] }];
  });
  const [activeProfileId, setActiveProfileId] = useState<string>('1');
  const [imageInput, setImageInput] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("healthProfiles", JSON.stringify(profiles));
  }, [profiles]);

  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];
  const selectedProfile = activeProfile.selectedIds;
  const [textInput, setTextInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedResult = useMemo<ReportData | null>(() => {
    if (!result) return null;
    const parsed = parseModelJson<ReportData>(result);
    if (!parsed) console.error("Failed to parse JSON result from model:", result.slice(0, 500));
    return parsed;
  }, [result]);

  // Cross-reference the scan against the AddiSafe knowledge base.
  // Grounding rules: use the model's explicit additive extraction first
  // (resolved INS/E-codes with the exact label text), then ingredient
  // NAMES only. The AI's commentary notes are deliberately excluded —
  // they contain speculation ("may be processed with sulphites") that
  // previously produced additives not actually on the label.
  const detectedAdditives = useMemo(() => {
    if (!parsedResult) return [] as { additive: Additive; source: string }[];
    const found = new Map<string, { additive: Additive; source: string }>();

    for (const d of parsedResult.additivesDetected ?? []) {
      const additive = (d.eCode ? findAdditive(d.eCode) : undefined) ?? findAdditive(d.name);
      if (additive && !found.has(additive.id)) {
        found.set(additive.id, { additive, source: d.labelText || d.name });
      }
    }

    for (const ing of parsedResult.ingredients ?? []) {
      for (const additive of detectAdditives(ing.name)) {
        if (!found.has(additive.id)) found.set(additive.id, { additive, source: ing.name });
      }
    }

    return [...found.values()];
  }, [parsedResult]);

  // Interaction risk for this scan — also feeds a penalty into the Health
  // Score, so "many dangerous interactions" can never coexist with a
  // reassuring overall score (the AI model scores nutrition only; it does
  // not know about pairwise additive chemistry).
  const scanInteractionRisk = useMemo(
    () => computeRisk(detectedAdditives.map((d) => d.additive)),
    [detectedAdditives]
  );
  const interactionPenalty = scanInteractionRisk.dangerousCount * 15 + scanInteractionRisk.moderateCount * 5;
  const adjustedHealthScore = parsedResult?.healthScore
    ? Math.max(0, Math.min(100, parsedResult.healthScore.total) - interactionPenalty)
    : 0;

  // Auto-load detected additives into the Interaction Lab after every scan
  useEffect(() => {
    if (detectedAdditives.length) setLabAdditiveIds(detectedAdditives.map((d) => d.additive.id));
  }, [detectedAdditives]);

  const sendToLab = () => {
    setLabAdditiveIds(detectedAdditives.map((d) => d.additive.id));
    setMode("lab");
  };

  const handleProfileChange = (id: string, checked: boolean) => {
    setProfiles((prev) => prev.map(p => {
      if (p.id === activeProfileId) {
        if (checked) {
          return { ...p, selectedIds: [...p.selectedIds, id] };
        } else {
          return { ...p, selectedIds: p.selectedIds.filter(selected => selected !== id) };
        }
      }
      return p;
    }));
  };

  const createProfile = () => {
      const newId = Date.now().toString();
      const newName = `Profile ${profiles.length + 1}`;
      setProfiles(prev => [...prev, { id: newId, name: newName, selectedIds: [] }]);
      setActiveProfileId(newId);
  };

  const deleteProfile = (id: string) => {
      if (profiles.length === 1) return;
      const newProfiles = profiles.filter(p => p.id !== id);
      setProfiles(newProfiles);
      if (activeProfileId === id) {
          setActiveProfileId(newProfiles[0].id);
      }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageInput(reader.result as string);
        setTextInput(""); // clear text if image uploaded
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleScan = async () => {
    if (!imageInput && !textInput.trim()) {
      setError("Please provide either a label image or enter the product details.");
      return;
    }

    setIsScanning(true);
    setError(null);
    setResult(null);

    try {
        const profileItems = selectedProfile.map(id => {
            return [...ALLERGEN_CATEGORIES, ...INTOLERANCES, ...DIETARY, ...CONDITIONS].find(item => item.id === id)?.label;
        }).filter(Boolean);
        
        const profileStr = profileItems.length > 0 ? profileItems.join(", ") : "General Adult";
        
        const response = await scanFoodLabel(profileStr, textInput, imageInput);
        setResult(response);
    } catch (err: any) {
        setError(err.message || "An error occurred during scanning. Please try again.");
    } finally {
        setIsScanning(false);
    }
  };

  if (view === "landing") {
    return <LandingPage onGetStarted={() => setView('app')} />
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground transition-colors duration-300">
      {/* Header */}
      <header className="bg-white/70 dark:bg-black/70 backdrop-blur-xl border-b border-border/50 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-primary text-primary-foreground px-2 py-1 text-xs font-bold tracking-tight rounded-md flex items-center gap-1 shadow-sm">
            EL v2.0
          </div>
          <AdisenseLogo className="h-9 sm:h-10 text-primary" />
        </div>

        {/* Mode switcher */}
        <div className="flex items-center gap-1 bg-secondary/60 border border-border/60 rounded-full p-1">
          <button
            onClick={() => setMode("scanner")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors ${mode === "scanner" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <ScanLine className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Label Scanner</span>
          </button>
          <button
            onClick={() => setMode("lab")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors ${mode === "lab" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Interaction Lab</span>
          </button>
          <button
            onClick={() => setMode("meal")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors ${mode === "meal" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Meal Analysis</span>
          </button>
        </div>

        <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
          {theme === "dark" ? <Sun className="w-5 h-5 text-foreground" /> : <Moon className="w-5 h-5 text-foreground" />}
        </Button>
      </header>

      {mode === "lab" && (
        <main className="max-w-[90rem] mx-auto p-4 md:p-6 lg:p-8">
          <AddiSafeDashboard initialAdditiveIds={labAdditiveIds} />
        </main>
      )}

      {mode === "meal" && <MealAnalysis />}

      {mode === "scanner" && (
      <main className="max-w-[90rem] mx-auto p-4 md:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-80px)]">
        
        {/* Left Column: Config & Input */}
        <div className="lg:col-span-4 space-y-6 flex flex-col h-full overflow-y-auto pr-2 pb-8">

          <Card className="rounded-3xl border-border/60 shadow-lg shadow-black/5 bg-card/80 backdrop-blur-lg overflow-hidden border shrink-0">
            <CardHeader className="bg-transparent border-b border-border/50 pb-4">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-sm uppercase tracking-wider font-bold">1. Health Profile</CardTitle>
                <Button variant="ghost" size="sm" onClick={createProfile} className="h-7 text-xs px-2 rounded-lg">
                  <Plus className="w-3 h-3 mr-1" /> New
                </Button>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-1">Select your allergies to personalize the scan.</CardDescription>
              
              {/* Profile Selector */}
              <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {profiles.map(p => (
                      <div key={p.id} className={`flex items-center justify-between shrink-0 rounded-full pl-3 pr-1 py-1 border text-xs font-semibold cursor-pointer transition-colors ${activeProfileId === p.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary/60'}`} onClick={() => setActiveProfileId(p.id)}>
                          {activeProfileId === p.id ? (
                               <input 
                                   type="text" 
                                   className="bg-transparent border-none outline-none font-bold text-primary-foreground w-20 px-0" 
                                   value={p.name}
                                   onChange={(e) => setProfiles(prev => prev.map(profile => profile.id === p.id ? { ...profile, name: e.target.value } : profile))}
                                   onClick={(e) => e.stopPropagation()}
                               />
                          ) : (
                               <span>{p.name}</span>
                          )}
                          
                          {activeProfileId === p.id && profiles.length > 1 && (
                              <div className="ml-2 bg-primary-foreground/20 hover:bg-destructive hover:text-destructive-foreground rounded-full p-1 transition-colors" onClick={(e) => { e.stopPropagation(); deleteProfile(p.id); }}>
                                  <Trash2 className="w-3 h-3" />
                              </div>
                          )}
                      </div>
                  ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[240px] p-2">
                <Accordion className="w-full">
                  <AccordionItem value="item-1" className="px-4 border-b border-border/50">
                    <AccordionTrigger className="text-sm font-semibold hover:no-underline py-3">Critical Allergens</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 pb-4">
                        {ALLERGEN_CATEGORIES.map((item) => (
                          <div key={item.id} className="flex items-center space-x-2">
                            <Checkbox 
                              id={item.id} 
                              checked={selectedProfile.includes(item.id)}
                              onCheckedChange={(c) => handleProfileChange(item.id, c as boolean)}
                            />
                            <Label htmlFor={item.id} className="text-xs font-medium leading-tight cursor-pointer">{item.label}</Label>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-2" className="px-4 border-b border-border/50">
                    <AccordionTrigger className="text-sm font-semibold hover:no-underline py-3">Intolerances</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 pb-4">
                        {INTOLERANCES.map((item) => (
                          <div key={item.id} className="flex items-center space-x-2">
                            <Checkbox 
                              id={item.id} 
                              checked={selectedProfile.includes(item.id)}
                              onCheckedChange={(c) => handleProfileChange(item.id, c as boolean)}
                            />
                            <Label htmlFor={item.id} className="text-xs font-medium leading-tight cursor-pointer">{item.label}</Label>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-3" className="px-4 border-b border-border/50">
                    <AccordionTrigger className="text-sm font-semibold hover:no-underline py-3">Dietary Restrictions</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 pb-4">
                        {DIETARY.map((item) => (
                          <div key={item.id} className="flex items-center space-x-2">
                            <Checkbox 
                              id={item.id} 
                              checked={selectedProfile.includes(item.id)}
                              onCheckedChange={(c) => handleProfileChange(item.id, c as boolean)}
                            />
                            <Label htmlFor={item.id} className="text-xs font-medium leading-tight cursor-pointer">{item.label}</Label>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-4" className="px-4 border-none">
                    <AccordionTrigger className="text-sm font-semibold hover:no-underline py-3">Health Conditions</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 pb-4">
                        {CONDITIONS.map((item) => (
                          <div key={item.id} className="flex items-center space-x-2">
                            <Checkbox 
                              id={item.id} 
                              checked={selectedProfile.includes(item.id)}
                              onCheckedChange={(c) => handleProfileChange(item.id, c as boolean)}
                            />
                            <Label htmlFor={item.id} className="text-xs font-medium leading-tight cursor-pointer">{item.label}</Label>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/60 shadow-lg shadow-black/5 bg-card/80 backdrop-blur-lg border shrink-0">
            <CardHeader className="bg-transparent border-b border-border/50 pb-4">
              <CardTitle className="text-sm uppercase tracking-wider font-bold">2. Input Product</CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">Upload an image of the label or type the ingredients manually.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              {/* Image Input */}
              <div 
                className="border border-dashed border-border/80 rounded-2xl bg-secondary/50 flex flex-col items-center justify-center p-8 transition-all duration-300 relative group overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageUpload}
                />
                <input 
                  type="file" 
                  id="camera-input"
                  className="hidden" 
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={handleImageUpload}
                />
                
                {imageInput ? (
                  <div className="relative w-full">
                    <img src={imageInput} alt="Uploaded Label" className="max-h-[160px] w-auto mx-auto rounded-xl object-contain shadow-sm" />
                    <div className="absolute top-2 right-2 flex gap-2">
                      <Button size="icon" variant="destructive" className="h-8 w-8 rounded-full shadow-md" onClick={(e) => { e.stopPropagation(); setImageInput(null); }}>
                        <span className="sr-only">Remove</span>
                        &times;
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center w-full">
                    <div className="w-14 h-14 rounded-full bg-background border border-border/60 flex items-center justify-center mx-auto mb-4 shadow-sm group-hover:scale-105 group-hover:shadow-md transition-all duration-300 cursor-pointer" onClick={triggerFileUpload}>
                      <UploadCloud className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <p className="text-sm font-semibold mb-3">Upload label image</p>
                    
                    <div className="flex gap-3 justify-center w-full mt-4">
                      <Button variant="outline" className="flex-1 rounded-xl shadow-sm border-border/60" onClick={() => document.getElementById('camera-input')?.click()}>
                        <Camera className="w-4 h-4 mr-2" />
                        Capture
                      </Button>
                      <Button variant="outline" className="flex-1 rounded-xl shadow-sm border-border/60" onClick={triggerFileUpload}>
                        <UploadCloud className="w-4 h-4 mr-2" />
                        Gallery
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 py-2">
                <Separator className="flex-1 bg-border/60" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">OR</span>
                <Separator className="flex-1 bg-border/60" />
              </div>

              {/* Text Input */}
              <div>
                <Label htmlFor="text-input" className="text-xs font-bold uppercase tracking-wider text-foreground mb-3 block">
                  Product Details or Transcript
                </Label>
                <Textarea 
                  id="text-input" 
                  placeholder="e.g. 'Oreo Cookies' or paste the ingredient list here..." 
                  className="min-h-[120px] text-sm resize-none rounded-2xl bg-secondary/30 focus-visible:ring-primary/40 border-border/80 shadow-inner"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter className="p-6 bg-transparent border-t border-border/50">
              <Button 
                className="w-full bg-primary text-primary-foreground hover:opacity-90 rounded-2xl h-14 text-sm font-bold tracking-wide uppercase shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
                onClick={handleScan}
                disabled={isScanning}
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                    Analyzing Label...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5 mr-3" />
                    Run Security Scan
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
          
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-2xl flex gap-3 text-sm font-medium backdrop-blur-sm">
              <AlertCircle className="w-5 h-5 shrink-0 text-destructive" />
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Right Column: Output / Result */}
        <div className="lg:col-span-8 flex flex-col h-full relative">
            {isScanning ? (
              <div className="absolute inset-0 bg-background/50 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-8 text-center z-20 border border-border/50 shadow-2xl">
                <div className="w-20 h-20 relative mb-8">
                  <div className="absolute inset-0 border border-primary/50 rounded-full animate-ping opacity-30"></div>
                  <div className="absolute inset-2 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <Shield className="absolute inset-0 m-auto w-8 h-8 text-primary drop-shadow-md" />
                </div>
                <h3 className="text-xl font-bold uppercase tracking-wider text-foreground">Intercepting Label Data</h3>
                <p className="text-sm font-medium text-muted-foreground mt-3 max-w-sm">Cross-referencing FSSAI regulations, NOVA classification, and your personal health profile...</p>
              </div>
            ) : null}

            {parsedResult ? (
               <div className="bg-transparent flex-1 h-full rounded-3xl overflow-hidden flex flex-col relative w-full h-[calc(100vh-120px)]">
                  {/* Top Bar Report Header */}
                  <div className="px-6 py-4 border border-border/50 border-b-0 flex items-center justify-between bg-card/50 backdrop-blur-xl rounded-t-[2.5rem] shrink-0 sticky top-0 z-10 w-full mt-4">
                     <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Intelligence Report 
                     </div>
                     <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary uppercase font-bold text-[10px] tracking-widest px-2 py-0.5">Verified</Badge>
                  </div>
                  
                  <ScrollArea className="flex-1 bg-card/30 backdrop-blur-xl border border-border/50 border-t-0 p-4 rounded-b-[2.5rem]">
                     <div className="p-4 md:p-6 lg:p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto pb-16">
                        
                        {/* Stop Banner - full width */}
                        {parsedResult.allergySafety?.stopBanner && (
                            <div className="col-span-full bg-destructive/10 border border-destructive/20 text-destructive rounded-[2rem] p-6 flex flex-col sm:flex-row items-center sm:items-start gap-4 backdrop-blur-md text-center sm:text-left shadow-lg shadow-destructive/5">
                                <AlertTriangle className="w-10 h-10 shrink-0" />
                                <div>
                                    <h4 className="text-2xl font-black uppercase tracking-tight">Danger</h4>
                                    <p className="font-bold text-sm mt-1">{parsedResult.allergySafety.stopBanner}</p>
                                </div>
                            </div>
                        )}

                        {/* AddiSafe: automatic chemical interaction analysis */}
                        {detectedAdditives.length >= 1 && (
                            <InteractionReport detected={detectedAdditives} onOpenLab={sendToLab} />
                        )}

                        {/* Health Score - spans full md: spans 2 lg: spans 3 */}
                        {parsedResult.healthScore && (
                        <div className="col-span-full bg-card border border-border/80 rounded-[2.5rem] p-8 shadow-sm backdrop-blur-2xl flex flex-col md:flex-row gap-8 items-center md:items-stretch overflow-hidden relative">
                           <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
                           <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-secondary rounded-full blur-3xl pointer-events-none"></div>
                           
                           <div className="flex-shrink-0 flex flex-col justify-center items-center md:items-start text-center md:text-left min-w-[200px] z-10">
                              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                                  <Shield className="w-4 h-4" /> Health Score
                              </div>
                              <div className="flex items-baseline gap-1">
                                <span className="text-7xl font-black tracking-tighter text-foreground">{adjustedHealthScore}</span>
                                <span className="text-xl text-muted-foreground font-bold">/100</span>
                              </div>
                              {interactionPenalty > 0 && (
                                <div className="mt-3 flex items-start gap-2 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl px-3 py-2 max-w-[250px]">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                  <p className="text-[11px] font-bold leading-snug">
                                    −{interactionPenalty} interaction penalty: {scanInteractionRisk.dangerousCount} dangerous, {scanInteractionRisk.moderateCount} moderate additive pair{scanInteractionRisk.interactions.length > 1 ? "s" : ""} (base score {parsedResult.healthScore?.total ?? 0})
                                  </p>
                                </div>
                              )}
                              <p className="mt-4 text-sm font-semibold leading-relaxed max-w-[250px] text-foreground/80">{parsedResult.healthScore?.verdict}</p>
                           </div>
                           
                           <div className="flex-1 w-full h-[220px] z-10 pl-0 md:pl-8">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={parsedResult.healthScore?.dimensions || []} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                                  <XAxis type="number" domain={[0, 30]} hide />
                                  <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                  <Tooltip cursor={{ fill: 'var(--secondary)', opacity: 0.5 }} contentStyle={{ borderRadius: '16px', border: '1px solid var(--border)', backgroundColor: 'var(--card)', color: 'var(--foreground)', fontSize: '11px', fontWeight: 'bold' }} />
                                  <Bar dataKey="score" radius={[0, 8, 8, 0]} barSize={14}>
                                     {(parsedResult.healthScore?.dimensions || []).map((entry, index) => {
                                         const ratio = entry.score / entry.max;
                                         let fill = '#34c759';
                                         if (ratio < 0.4) fill = '#ff3b30';
                                         else if (ratio < 0.7) fill = '#ff9500';
                                         return <Cell key={`cell-${index}`} fill={fill} />
                                     })}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                           </div>
                        </div>
                        )}

                        {/* Snapshot */}
                        {parsedResult.snapshot && (
                        <BentoCard title="Product Snapshot" icon={Info} className="col-span-full md:col-span-1 lg:col-span-1">
                           <div className="space-y-5 h-full flex flex-col">
                              <div>
                                 <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{parsedResult.snapshot?.brand}</div>
                                 <div className="text-2xl font-black tracking-tight leading-tight mt-1 text-foreground">{parsedResult.snapshot?.name}</div>
                                 <div className="text-sm font-semibold text-muted-foreground mt-2">{parsedResult.snapshot?.variant} • {parsedResult.snapshot?.netWeight}</div>
                              </div>
                              <div className="mt-auto pt-5 border-t border-border/60 grid grid-cols-2 gap-4">
                                 <div>
                                    <div className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">Serving Size</div>
                                    <div className="text-sm font-bold mt-1 text-foreground truncate">{parsedResult.snapshot?.servingSize}</div>
                                 </div>
                                 <div>
                                    <div className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">Target Auth</div>
                                    <div className="text-xs font-bold mt-1 text-foreground truncate">{parsedResult.snapshot?.demographic}</div>
                                 </div>
                              </div>
                           </div>
                        </BentoCard>
                        )}

                        {/* Allergy Safety */}
                        {parsedResult.allergySafety && (
                        <BentoCard title="Allergy Safety" icon={Shield} className="col-span-full md:col-span-1 lg:col-span-2">
                           <div className="text-xs font-bold text-muted-foreground mb-4 pb-3 border-b border-border/60 flex items-center justify-between">
                             <span className="uppercase tracking-widest">Active Profile</span>
                             <span className="text-foreground font-semibold bg-secondary px-2 py-1 rounded-md">{parsedResult.allergySafety?.profile}</span>
                           </div>
                           <div className="space-y-3 pr-2 flex-grow">
                              {(parsedResult.allergySafety?.items || []).map((item, i) => {
                                  const colors = {
                                     "CRITICAL": "text-destructive bg-destructive/10 border-destructive/20",
                                     "HIGH": "text-orange-500 bg-orange-500/10 border-orange-500/20",
                                     "CAUTION": "text-[#ffcc00] bg-[#ffcc00]/10 border-[#ffcc00]/20",
                                     "CLEAR": "text-green-500 bg-green-500/10 border-green-500/20"
                                  };
                                  const icons = {
                                     "CRITICAL": <XCircle className="w-5 h-5 shrink-0" />,
                                     "HIGH": <AlertTriangle className="w-5 h-5 shrink-0" />,
                                     "CAUTION": <AlertCircle className="w-5 h-5 shrink-0 text-yellow-500" />,
                                     "CLEAR": <CheckCircle className="w-5 h-5 shrink-0" />
                                  };
                                  return (
                                    <div key={i} className={`flex items-start gap-4 p-4 rounded-2xl border ${colors[item.severity]}`}>
                                      <div className="mt-0.5">{icons[item.severity]}</div>
                                      <div>
                                         <div className="text-sm font-bold uppercase tracking-wide">{item.allergen}</div>
                                         <div className="text-xs font-semibold opacity-90 mt-1 leading-relaxed">{item.reason}</div>
                                      </div>
                                    </div>
                                  )
                              })}
                           </div>
                        </BentoCard>
                        )}

                        {/* Nutrition */}
                        {parsedResult.nutrition && (
                        <BentoCard title="Nutrition Overview" icon={HeartPulse} className="col-span-full">
                           <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                               {(parsedResult.nutrition || []).map((nut, i) => (
                                  <div key={i} className="flex flex-col p-4 rounded-2xl bg-secondary/40 border border-border/60 hover:bg-secondary/60 transition-colors">
                                     <div className="text-[10px] uppercase tracking-widest font-bold mb-3 text-muted-foreground h-8 line-clamp-2">{nut.nutrient}</div>
                                     <div className="text-xl font-bold tracking-tight text-foreground">{nut.perServing}</div>
                                     <div className="mt-auto pt-3 flex items-center justify-between border-t border-border/60">
                                        <div className="text-[10px] font-bold text-muted-foreground">{nut.rdiPercent}% RDI</div>
                                        <div className={`w-2 h-2 rounded-full ${
                                           nut.status === 'EXCEEDS LIMIT' ? 'bg-destructive shadow-[0_0_8px_rgba(255,59,48,0.8)]' :
                                           nut.status === 'APPROACHING LIMIT' ? 'bg-orange-500 shadow-[0_0_8px_rgba(255,149,0,0.8)]' : 'bg-green-500 shadow-[0_0_8px_rgba(52,199,89,0.8)]'
                                        }`}></div>
                                     </div>
                                  </div>
                               ))}
                           </div>
                        </BentoCard>
                        )}

                        {/* Ingredients */}
                        {parsedResult.ingredients && (
                        <BentoCard title="Ingredients Deep Dive" icon={FileText} className="col-span-full lg:col-span-2">
                           <div className="pr-4 space-y-4">
                              {(parsedResult.ingredients || []).map((ing, i) => (
                                 <div key={i} className="flex flex-col gap-1.5 pb-4 border-b border-border/40 last:border-0 last:pb-0">
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex items-center gap-2 flex-wrap">
                                         <span className="font-bold text-sm text-foreground">{ing.name}</span>
                                         {ing.allergenMatch && <span className="text-[9px] uppercase tracking-wider font-extrabold bg-destructive text-destructive-foreground px-2 py-0.5 rounded-md shadow-sm">Allergen</span>}
                                      </div>
                                      <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-md shrink-0 ${
                                        ing.status === 'FLAG' ? 'bg-destructive/10 text-destructive border border-destructive/20' :
                                        ing.status === 'CAUTION' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : 
                                        'bg-green-500/10 text-green-500 border border-green-500/20'
                                      }`}>
                                        {ing.status}
                                      </span>
                                    </div>
                                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{ing.function}</div>
                                    <div className="text-xs font-semibold text-foreground/80 mt-1 leading-relaxed bg-secondary/30 p-2 rounded-lg border border-border/40">{ing.note}</div>
                                 </div>
                              ))}
                           </div>
                        </BentoCard>
                        )}

                        {/* Alternatives */}
                        {parsedResult.alternatives && (
                        <BentoCard title="Healthier Swaps" icon={Carrot} className="col-span-full lg:col-span-1 bg-gradient-to-br from-green-500/5 to-transparent border-green-500/20 h-full">
                           <div className="space-y-3 pr-2 h-full">
                              {(parsedResult.alternatives || []).map((alt, i) => (
                                 <div key={i} className="p-4 bg-card/80 backdrop-blur-md rounded-2xl border border-border/80 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="text-sm font-bold text-foreground leading-tight">{alt.product}</div>
                                    <div className="text-[11px] font-semibold text-muted-foreground mt-2 leading-relaxed">{alt.why}</div>
                                    {alt.allergenNote && (
                                       <div className="text-[10px] text-primary font-bold mt-3 bg-primary/10 border border-primary/20 p-2 rounded-lg leading-relaxed flex items-start gap-1.5">
                                          <CheckCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                          {alt.allergenNote}
                                       </div>
                                    )}
                                 </div>
                              ))}
                              {parsedResult.diyAlternative && (
                                 <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 shadow-sm mt-4">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">DIY Recipe</div>
                                    <div className="text-xs font-semibold text-foreground leading-relaxed">{parsedResult.diyAlternative}</div>
                                 </div>
                              )}
                           </div>
                        </BentoCard>
                        )}

                        {/* Health Flags */}
                        {parsedResult.healthFlags && parsedResult.healthFlags.length > 0 && (
                            <BentoCard title="Medical Flags" icon={Stethoscope} className="col-span-full">
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {parsedResult.healthFlags.map((flag, i) => (
                                     <div key={i} className="flex gap-4 p-5 rounded-2xl bg-orange-500/10 border border-orange-500/20">
                                         <AlertTriangle className="w-6 h-6 shrink-0 text-orange-500" />
                                         <div>
                                            <div className="font-bold text-sm text-orange-600 dark:text-orange-400 uppercase tracking-widest mb-1">{flag.profile}</div>
                                            <div className="text-sm font-semibold text-foreground mb-3">{flag.risk}</div>
                                            <div className="text-[11px] font-extrabold uppercase tracking-widest bg-orange-500 text-white px-2 py-1 rounded-md inline-block shadow-sm">Act: {flag.action}</div>
                                         </div>
                                     </div>
                                  ))}
                               </div>
                            </BentoCard>
                        )}

                        {/* Bottom Line */}
                        {parsedResult.bottomLine && (
                        <div className="col-span-full mt-4 flex justify-center pb-8">
                            <div className="max-w-2xl text-center">
                                <h3 className="text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-3 bg-secondary inline-block px-3 py-1 rounded-full border border-border/60">Bottom Line</h3>
                                <p className="text-sm md:text-base font-bold leading-relaxed bg-primary/5 p-5 rounded-3xl border border-primary/10 text-foreground shadow-sm">{parsedResult.bottomLine}</p>
                            </div>
                        </div>
                        )}

                     </div>
                  </ScrollArea>
               </div>
            ) : result && !isScanning ? (
                // Fallback when the model response could not be structured even after repair
                <div className="bg-card/30 backdrop-blur-md flex-1 rounded-3xl p-8 border border-border/50 overflow-y-auto">
                    <div className="bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400 rounded-2xl p-5 flex gap-3 mb-6">
                        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-bold">The AI returned a response we couldn't fully structure.</p>
                            <p className="text-xs font-medium mt-1 opacity-90">Hit "Run Security Scan" again — a retry usually fixes this. The raw response is below.</p>
                        </div>
                    </div>
                    <Button variant="outline" className="rounded-xl mb-4 font-bold" onClick={handleScan}>
                        <Loader2 className="w-4 h-4 mr-2" /> Retry Scan
                    </Button>
                    <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{result}</pre>
                </div>
            ) : (!isScanning && (
               <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-card/10 backdrop-blur-sm rounded-[2.5rem] mt-4 border border-dashed border-border/60">
                 <div className="w-32 h-32 bg-secondary/50 rounded-[2.5rem] flex items-center justify-center mb-8 border border-border/80 shadow-lg shadow-black/5">
                   <FileText className="w-12 h-12 text-muted-foreground/60" />
                 </div>
                 <h3 className="text-2xl font-black text-foreground tracking-tight">No System Output</h3>
                 <p className="mt-4 text-sm font-medium text-muted-foreground max-w-sm mx-auto leading-relaxed">
                   Initialize a scan from the control panel to view the intelligence report.
                 </p>
               </div>
            ))}
        </div>
      </main>
      )}
    </div>
  );
}
