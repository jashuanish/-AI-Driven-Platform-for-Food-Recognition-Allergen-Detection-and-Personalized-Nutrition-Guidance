from collections import defaultdict
import os
from pathlib import Path
from threading import Lock

import torch

from config import CONFIDENCE_THRESHOLD, YOLO_MODEL_PATH

BACKEND_DIR = Path(__file__).resolve().parents[1]
ULTRALYTICS_CONFIG_DIR = BACKEND_DIR / ".ultralytics"
MATPLOTLIB_CONFIG_DIR = BACKEND_DIR / ".matplotlib"
ULTRALYTICS_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
MATPLOTLIB_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("YOLO_CONFIG_DIR", str(ULTRALYTICS_CONFIG_DIR))
os.environ.setdefault("MPLCONFIGDIR", str(MATPLOTLIB_CONFIG_DIR))

from ultralytics import YOLO


class DetectorError(Exception):
    pass


class LocalYOLODetector:
    def __init__(self):
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.load_error = None
        self._lock = Lock()
        self._load_model()

    def _load_model(self):
        model_path = Path(__file__).resolve().parents[1] / YOLO_MODEL_PATH
        if not model_path.exists():
            self.load_error = f"YOLO model file not found: {model_path}"
            return

        try:
            self.model = YOLO(str(model_path))
            self.model.to(self.device)
        except Exception as error:
            self.load_error = f"Failed to load YOLO model: {error}"

    def detect(self, image_path):
        if self.load_error:
            raise DetectorError(self.load_error)
        if self.model is None:
            raise DetectorError("YOLO model is not loaded")

        try:
            with self._lock:
                results = self.model(image_path, device=self.device, verbose=False)
        except Exception as error:
            raise DetectorError(f"Model inference failed: {error}") from error

        grouped = defaultdict(
            lambda: {
                "food_name": "",
                "count": 0,
                "confidence": 0,
                "bounding_boxes": [],
            }
        )

        for result in results:
            names = result.names or {}
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue

            for box in boxes:
                confidence = float(box.conf.item())
                if confidence < CONFIDENCE_THRESHOLD:
                    continue

                class_id = int(box.cls.item())
                food_name = names.get(class_id, str(class_id))
                x_center, y_center, width, height = [float(value) for value in box.xywh[0].tolist()]

                grouped[food_name]["food_name"] = food_name
                grouped[food_name]["count"] += 1
                grouped[food_name]["confidence"] = max(grouped[food_name]["confidence"], round(confidence, 4))
                grouped[food_name]["bounding_boxes"].append(
                    {
                        "x": round(x_center, 2),
                        "y": round(y_center, 2),
                        "width": round(width, 2),
                        "height": round(height, 2),
                    }
                )

        return list(grouped.values())


DETECTOR = LocalYOLODetector()


def detect_foods(image_path):
    return DETECTOR.detect(image_path)
