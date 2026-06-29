import React, { useEffect, useRef, useState } from "react";
import { BarcodeDetector } from "barcode-detector/ponyfill";
import { X, Loader2, ScanBarcode, AlertCircle, Camera, Keyboard, PackageSearch, ImageUp, Aperture } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Additive } from "@/src/lib/additives";
import {
  fetchProductByBarcode, extractKnownAdditives,
  ProductNotFoundError, type OffProduct,
} from "@/src/lib/openFoodFacts";

// zxing-wasm via the BarcodeDetector API — an industrial-grade C++ decoder
// compiled to WebAssembly. Far more reliable for 1D retail barcodes than
// any pure-JS decoder, and works identically on every platform (Chrome on
// Windows has no native BarcodeDetector).
const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });

const BARCODE_TEXT = /^\d{8,14}$/;
const LIVE_DETECT_INTERVAL_MS = 280;

type Phase = "starting" | "scanning" | "camera-denied" | "looking-up" | "error";

export interface BarcodeScanResult {
  product: OffProduct;
  additives: Additive[];
}

function cameraErrorMessage(e: unknown): string {
  const name = (e as any)?.name ?? "";
  const text = String(e).toLowerCase();
  if (name === "NotAllowedError" || text.includes("permission") || text.includes("denied")) {
    return "Camera permission was denied. Allow camera access in your browser settings, or use the photo / manual options below.";
  }
  if (name === "NotFoundError" || text.includes("requested device not found")) {
    return "No camera was found on this device. Use the photo upload or manual entry below.";
  }
  if (name === "NotReadableError" || text.includes("could not start video source")) {
    return "The camera is in use by another app. Close it and reopen the scanner, or use the options below.";
  }
  return "Could not start the camera here. Use the photo upload or manual entry below.";
}

async function detectFrom(source: ImageBitmapSource): Promise<string | null> {
  try {
    const results = await detector.detect(source as any);
    const value = results.find((r) => BARCODE_TEXT.test(r.rawValue))?.rawValue ?? null;
    return value;
  } catch {
    return null;
  }
}

function upscaleToCanvas(bitmap: ImageBitmap | HTMLCanvasElement, targetWidth: number, pad = 60): HTMLCanvasElement {
  const scale = Math.min(targetWidth / bitmap.width, 2400 / bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w + pad * 2;
  canvas.height = h + pad * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; // white quiet zone around the bars
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, pad, pad, w, h);
  return canvas;
}

/** Thorough still-image decode: native size, then upscaled with quiet zone. */
async function decodeImageRobustly(source: File | HTMLCanvasElement): Promise<string | null> {
  try {
    const bitmap = source instanceof File ? await createImageBitmap(source) : source;
    const direct = await detectFrom(bitmap);
    if (direct) return direct;
    if (bitmap.width < 2000) {
      return await detectFrom(upscaleToCanvas(bitmap, Math.max(1600, bitmap.width * 3)));
    }
    return null;
  } catch {
    return null;
  }
}

export default function BarcodeScanner({
  onResult,
  onClose,
}: {
  onResult: (result: BarcodeScanResult) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [snapping, setSnapping] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false); // ignore repeat decodes while a lookup runs
  const phaseRef = useRef<Phase>("starting");
  // Incremented on every mount/unmount so async work started by a dead
  // mount (StrictMode double-mounts!) can detect it and shut itself down.
  const sessionRef = useRef(0);
  const loopTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  /** Grab a still from the live video, cropped to the central aiming band. */
  const captureFrame = (): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = Math.round(vw * 0.94);
    const ch = Math.round(vh * 0.65);
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    canvas.getContext("2d")!.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, cw, ch);
    return canvas;
  };

  const stopLoop = () => {
    if (loopTimerRef.current !== null) {
      window.clearInterval(loopTimerRef.current);
      loopTimerRef.current = null;
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  /**
   * Continuous snapshot scanning: every ~280ms grab a frame at full sensor
   * resolution and decode it. With a shaky hand some frame will land sharp —
   * no need to hold perfectly still.
   */
  const startDetectLoop = (session: number) => {
    stopLoop();
    let inFlight = false;
    loopTimerRef.current = window.setInterval(async () => {
      if (sessionRef.current !== session) { stopLoop(); return; }
      if (inFlight || busyRef.current || phaseRef.current !== "scanning") return;
      const frame = captureFrame();
      if (!frame) return;
      inFlight = true;
      try {
        const decoded = await detectFrom(frame);
        if (decoded && sessionRef.current === session && !busyRef.current) {
          setError(null);
          void lookupBarcode(decoded);
        }
      } finally {
        inFlight = false;
      }
    }, LIVE_DETECT_INTERVAL_MS);
  };

  /** Manual shutter: one thorough decode (with upscale pass) + feedback. */
  const snapAndScan = async () => {
    if (busyRef.current || snapping || phaseRef.current !== "scanning") return;
    const session = sessionRef.current;
    const frame = captureFrame();
    if (!frame) {
      setError("The camera frame isn't ready yet — give it a second and snap again.");
      return;
    }
    setSnapping(true);
    try {
      const decoded = await decodeImageRobustly(frame);
      if (sessionRef.current !== session || busyRef.current) return;
      if (decoded) {
        setError(null);
        void lookupBarcode(decoded);
      } else {
        setError("Couldn't read a barcode in that snapshot. Hold the code flat, fill the frame, and snap again.");
      }
    } finally {
      if (sessionRef.current === session) setSnapping(false);
    }
  };

  const startCamera = async () => {
    const session = sessionRef.current;
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (sessionRef.current !== session) {
        // This mount was cleaned up while the camera was still starting.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => { /* autoplay quirks — video still renders */ });
      if (sessionRef.current !== session) return;
      setPhase("scanning");
      startDetectLoop(session);
    } catch (e) {
      if (sessionRef.current !== session) return;
      setPhase("camera-denied");
      setError(cameraErrorMessage(e));
    }
  };

  const lookupBarcode = async (barcode: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const session = sessionRef.current;
    setPhase("looking-up");
    setError(null);
    try {
      const product = await fetchProductByBarcode(barcode);
      const additives = extractKnownAdditives(product);
      if (sessionRef.current !== session) return;
      onResult({ product, additives });
    } catch (e: any) {
      busyRef.current = false;
      if (sessionRef.current !== session) return;
      if (e instanceof ProductNotFoundError) {
        setError(`${e.message} Try another product, or use the photo / manual options.`);
      } else {
        setError(e?.message || "Lookup failed. Check your connection and try again.");
      }
      // The camera (if running) was never stopped — go right back to scanning.
      setPhase(streamRef.current ? "scanning" : "error");
      if (!streamRef.current) setPhase("error");
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    const session = sessionRef.current;
    if (!file) return;
    setError(null);
    setPhase("looking-up");
    const decoded = await decodeImageRobustly(file);
    if (sessionRef.current !== session) return;
    if (decoded) {
      await lookupBarcode(decoded);
      return;
    }
    setError("No readable barcode found in that photo. Try a closer, straight-on shot — or type the digits printed under the bars.");
    setPhase(streamRef.current ? "scanning" : "error");
  };

  useEffect(() => {
    sessionRef.current += 1;
    busyRef.current = false;
    void startCamera();
    return () => {
      sessionRef.current += 1; // invalidate any in-flight async work
      stopLoop();
      stopStream();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (code) void lookupBarcode(code);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card border border-border/80 rounded-[2rem] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanBarcode className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider">Scan Product Barcode</h3>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={onClose} aria-label="Close scanner">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Camera viewport */}
        <div className="relative bg-black min-h-[260px] flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full max-h-[320px] object-cover ${phase === "scanning" || phase === "looking-up" ? "" : "opacity-0"}`}
          />

          {/* Aiming frame */}
          {phase === "scanning" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[86%] h-[46%] border-2 border-white/80 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}

          {phase === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
              <Camera className="w-8 h-8 animate-pulse" />
              <p className="text-xs font-semibold">Requesting camera…</p>
            </div>
          )}

          {phase === "looking-up" && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 text-white z-10">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-xs font-bold uppercase tracking-widest">Reading barcode…</p>
            </div>
          )}

          {(phase === "camera-denied" || (phase === "error" && !streamRef.current)) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80 p-6 text-center">
              <PackageSearch className="w-8 h-8" />
              <p className="text-xs font-semibold leading-relaxed">{error}</p>
            </div>
          )}

          {phase === "scanning" && (
            <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-2.5 z-10">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/90 bg-black/50 px-3 py-1 rounded-full pointer-events-none">
                Scanning continuously — shaking is fine
              </span>
              <button
                onClick={() => void snapAndScan()}
                disabled={snapping}
                className="flex items-center gap-2 bg-white text-black font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full shadow-lg hover:bg-white/90 active:scale-95 transition-all disabled:opacity-60"
              >
                {snapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Aperture className="w-4 h-4" />}
                Snap & Scan
              </button>
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && phase !== "camera-denied" && phase !== "looking-up" && (
          <div className="mx-5 mt-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl p-3.5 flex gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold leading-relaxed">{error}</p>
          </div>
        )}

        {/* Fallbacks: photo upload + manual entry */}
        <div className="p-5 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoUpload}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full h-11 rounded-xl font-bold"
            onClick={() => fileInputRef.current?.click()}
            disabled={phase === "looking-up"}
          >
            <ImageUp className="w-4 h-4 mr-2" />
            Scan from a photo instead
          </Button>

          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label htmlFor="manual-barcode" className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5" /> Or type the barcode digits
            </label>
            <div className="flex gap-2">
              <input
                id="manual-barcode"
                inputMode="numeric"
                pattern="\d*"
                placeholder="e.g. 5449000131805"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.replace(/[^\d]/g, ""))}
                className="flex-1 h-11 px-4 rounded-xl bg-secondary/40 border border-border/80 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/40"
              />
              <Button type="submit" className="h-11 rounded-xl font-bold px-5" disabled={!manualCode.trim() || phase === "looking-up"}>
                {phase === "looking-up" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Look up"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
