import csv
import io
import json
from pathlib import Path

import numpy as np
import tensorflow as tf
from PIL import Image, UnidentifiedImageError
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse


ROOT = Path(__file__).resolve().parent.parent

# Material classifier
MATERIAL_MODEL_PATH = ROOT / "models/jijigreen_mobilenetv2.keras"
MATERIAL_LABELS_PATH = ROOT / "models/class_names.json"

# Experimental brand classifier
BRAND_MODEL_PATH = (
    ROOT / "experiments/brand_recognition/models/"
    "brand_mobilenetv2_best.keras"
)
BRAND_MAPPING_PATH = (
    ROOT / "experiments/brand_recognition/models/class_mapping.json"
)

IMAGE_SIZE = (224, 224)
MAX_FILE_SIZE = 5 * 1024 * 1024
DIY_IDEAS_PATH = ROOT / "data/circularity/diy/reuse_ideas.csv"
BRAND_CONFIDENCE_THRESHOLD = 0.60

app = FastAPI(
    title="JijiGreen AI API",
    description=(
        "Waste material classification and experimental "
        "bottle brand recognition."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

material_model = None
material_classes = None

brand_model = None
brand_classes = None


@app.on_event("startup")
def load_models():
    global material_model, material_classes
    global brand_model, brand_classes

    required_files = [
        MATERIAL_MODEL_PATH,
        MATERIAL_LABELS_PATH,
        BRAND_MODEL_PATH,
        BRAND_MAPPING_PATH,
    ]

    for path in required_files:
        if not path.exists():
            raise RuntimeError(f"Required file not found: {path}")

    with open(MATERIAL_LABELS_PATH, "r") as file:
        material_classes = json.load(file)

    with open(BRAND_MAPPING_PATH, "r") as file:
        mapping = json.load(file)

    brand_classes = [
        name for name, index in
        sorted(mapping.items(), key=lambda item: item[1])
    ]

    material_model = tf.keras.models.load_model(
        MATERIAL_MODEL_PATH,
        compile=False,
    )

    brand_model = tf.keras.models.load_model(
        BRAND_MODEL_PATH,
        compile=False,
    )

    print("JijiGreen material model loaded:", material_classes)
    print("JijiGreen brand model loaded:", brand_classes)


def read_image(contents):
    try:
        image = Image.open(io.BytesIO(contents))
        image.verify()

        image = Image.open(io.BytesIO(contents)).convert("RGB")
        image = image.resize(IMAGE_SIZE)

        return np.expand_dims(
            np.asarray(image, dtype=np.float32),
            axis=0,
        )

    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="Invalid or corrupted image.",
        )


def validate_image_quality(contents):
    """
    Perform preliminary image-quality checks.
    This does NOT determine whether an image contains waste.
    """
    try:
        image = Image.open(io.BytesIO(contents)).convert("RGB")

        width, height = image.size

        if width < 100 or height < 100:
            raise HTTPException(
                status_code=400,
                detail="Image is too small. Upload a clearer image."
            )

        grayscale = np.asarray(
            image.convert("L"),
            dtype=np.float32
        )

        brightness = float(np.mean(grayscale))

        # Reject only extremely dark or overexposed images.
        if brightness < 10 or brightness > 250:
            raise HTTPException(
                status_code=400,
                detail="Image lighting is unsuitable. Upload a better-lit image."
            )

        # Basic blur assessment using neighbouring pixel differences.
        horizontal = np.diff(grayscale, axis=1)
        vertical = np.diff(grayscale, axis=0)

        sharpness = float(
            (np.mean(np.abs(horizontal)) +
             np.mean(np.abs(vertical))) / 2
        )

        if sharpness < 1.0:
            raise HTTPException(
                status_code=400,
                detail="Image appears excessively blurred. Upload a sharper image."
            )

        return {
            "width": width,
            "height": height,
            "brightness": round(brightness, 2),
            "sharpness": round(sharpness, 2),
            "quality_status": "passed"
        }

    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="Unable to validate the uploaded image."
        )


async def get_uploaded_image(file):
    allowed_types = {"image/jpeg", "image/png"}

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=415,
            detail="Upload a JPG, JPEG or PNG image.",
        )

    contents = await file.read(MAX_FILE_SIZE + 1)

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Image exceeds the 5 MB limit.",
        )

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty.",
        )

    # Preliminary image-quality validation
    validate_image_quality(contents)

    return read_image(contents)


def run_material_prediction(image_array):
    predictions = material_model.predict(
        image_array,
        verbose=0,
    )[0]

    # Rank the two most likely material classes.
    ranked_indices = np.argsort(predictions)[::-1]

    index = int(ranked_indices[0])
    second_index = int(ranked_indices[1])

    confidence = float(predictions[index])
    second_confidence = float(predictions[second_index])
    confidence_margin = confidence - second_confidence

    # Provisional thresholds; these require validation against test data.
    confidence_threshold = 0.60
    margin_threshold = 0.15

    is_confident = (
        confidence >= confidence_threshold
        and confidence_margin >= margin_threshold
    )

    review_reasons = []

    if confidence < confidence_threshold:
        review_reasons.append("Low prediction confidence")

    if confidence_margin < margin_threshold:
        review_reasons.append("Competing material classes are too close")

    return {
        "predicted_material": material_classes[index],
        "confidence": round(confidence, 4),
        "confidence_percent": round(confidence * 100, 2),
        "second_best_material": material_classes[second_index],
        "second_best_confidence": round(second_confidence, 4),
        "confidence_margin": round(confidence_margin, 4),
        "confidence_margin_percent": round(confidence_margin * 100, 2),
        "prediction_status": (
            "confident_prediction" if is_confident else "uncertain"
        ),
        "requires_additional_review": not is_confident,
        "review_reasons": review_reasons,
        "probabilities": {
            material_classes[i]: round(float(predictions[i]), 4)
            for i in range(len(predictions))
        },
        "model": "MobileNetV2",
        "test_accuracy": 83.16,
        "test_images": 380,
        "notice": (
            "Confidence thresholds are provisional and have not yet "
            "been calibrated. Test accuracy was measured on the held-out "
            "project dataset, not a representative Kenyan field dataset."
        ),
    }


def run_brand_prediction(image_array):
    predictions = brand_model.predict(
        image_array,
        verbose=0,
    )[0]

    index = int(np.argmax(predictions))
    confidence = float(predictions[index])

    return {
        "predicted_brand": brand_classes[index],
        "confidence": round(confidence, 4),
        "confidence_percent": round(confidence * 100, 2),
        "probabilities": {
            brand_classes[i]: round(float(predictions[i]), 4)
            for i in range(len(brand_classes))
        },
        "manual_verification_recommended": True,
        "verification_reason": (
            "Experimental model. Every brand prediction "
            "requires human verification regardless of confidence."
        ),
        "model": "MobileNetV2",
        "experimental": True,
        "notice": (
            "Experimental two-class bottle brand model. "
            "Its small test set achieved 62.5% accuracy, and "
            "Predator recall was 0% on that test set. "
            "Verify every result manually."
        ),
    }


@app.get("/")
def home():
    return {
        "project": "JijiGreen",
        "service": "Combined AI API",
        "status": "running",
        "capabilities": [
            "Six-class waste material classification",
            "Experimental two-class bottle brand recognition",
        ],
    }


@app.get("/health")
def health():
    material_loaded = material_model is not None
    brand_loaded = brand_model is not None

    return {
        "status": (
            "healthy"
            if material_loaded and brand_loaded
            else "not_ready"
        ),
        "material_model_loaded": material_loaded,
        "brand_model_loaded": brand_loaded,
    }


@app.post("/predict/material")
async def predict_material(file: UploadFile = File(...)):
    image_array = await get_uploaded_image(file)

    try:
        return {
            "success": True,
            "material": run_material_prediction(image_array),
        }
    except Exception as error:
        if isinstance(error, HTTPException):
            raise
        raise HTTPException(
            status_code=500,
            detail="Material prediction failed.",
        )


@app.post("/predict/brand")
async def predict_brand(file: UploadFile = File(...)):
    image_array = await get_uploaded_image(file)

    try:
        return {
            "success": True,
            "brand": run_brand_prediction(image_array),
        }
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Brand prediction failed.",
        )


@app.post("/predict")
async def predict_combined(
    file: UploadFile = File(...),
    is_bottle: bool = Form(False),
):
    image_array = await get_uploaded_image(file)

    try:
        material_result = run_material_prediction(image_array)

        eligible_materials = {"plastic", "glass"}
        predicted_material = material_result["predicted_material"]

        if not is_bottle:
            brand_result = None
            brand_status = "skipped_not_confirmed_as_bottle"

        elif predicted_material not in eligible_materials:
            brand_result = None
            brand_status = "skipped_material_not_supported"

        else:
            brand_result = run_brand_prediction(image_array)
            brand_status = "experimental_prediction"

        return {
            "success": True,
            "project": "JijiGreen",
            "material": material_result,
            "brand_recognition": {
                "status": brand_status,
                "result": brand_result,
            },
            "verification_required": True,
            "notice": (
                "AI predictions are decision-support results. "
                "A collection-point operator must verify the "
                "actual material and item before accepting it."
            ),
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Combined prediction failed.",
        )




@app.get("/recommendations/diy")
def get_diy_recommendations(
    material: str,
    audience: str = "user",
):
    material = material.strip().lower()
    audience = audience.strip().lower()

    supported_materials = {
        "cardboard", "glass", "metal", "paper", "plastic", "trash"
    }

    if material not in supported_materials:
        raise HTTPException(
            status_code=400,
            detail="Unsupported material category.",
        )

    if audience not in {"user", "collector"}:
        raise HTTPException(
            status_code=400,
            detail="Audience must be either 'user' or 'collector'.",
        )

    if not DIY_IDEAS_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail="DIY recommendation dataset is unavailable.",
        )

    # Current dataset contains household reuse projects only.
    if audience == "collector":
        return {
            "success": True,
            "material": material,
            "audience": audience,
            "total_recommendations": 0,
            "recommendations": [],
            "message": (
                "Collector-specific guidance has not yet been added."
            ),
        }

    try:
        with open(
            DIY_IDEAS_PATH,
            "r",
            newline="",
            encoding="utf-8-sig",
        ) as file:
            reader = csv.DictReader(file)

            required_columns = {
                "idea_id",
                "title",
                "material",
                "description",
                "materials_needed",
                "difficulty",
                "estimated_time_minutes",
                "instructions",
                "tutorial_url",
                "tutorial_source",
                "safety_warnings",
                "potential_use",
                "verification_status",
            }

            if not reader.fieldnames or not required_columns.issubset(
                set(reader.fieldnames)
            ):
                raise HTTPException(
                    status_code=500,
                    detail="DIY dataset has an invalid structure.",
                )

            recommendations = []

            for row in reader:
                if row["material"].strip().lower() != material:
                    continue

                recommendations.append({
                    "idea_id": row["idea_id"],
                    "title": row["title"],
                    "material": row["material"],
                    "description": row["description"],
                    "materials_needed": [
                        item.strip()
                        for item in row["materials_needed"].split(";")
                        if item.strip()
                    ],
                    "difficulty": row["difficulty"],
                    "estimated_time_minutes": row[
                        "estimated_time_minutes"
                    ],
                    "instructions": row["instructions"],
                    "tutorial_url": row["tutorial_url"],
                    "tutorial_source": row["tutorial_source"],
                    "safety_warnings": row["safety_warnings"],
                    "potential_use": row["potential_use"],
                    "verification_status": row["verification_status"],
                })

    except HTTPException:
        raise
    except (OSError, csv.Error, UnicodeError):
        raise HTTPException(
            status_code=500,
            detail="Unable to read DIY recommendations.",
        )

    return {
        "success": True,
        "material": material,
        "audience": audience,
        "total_recommendations": len(recommendations),
        "recommendations": recommendations,
        "message": (
            "Recommendations are available."
            if recommendations
            else "No DIY recommendations are currently available for this material."
        ),
        "notice": (
            "Review status is provided for each recommendation. "
            "Unreviewed tutorials should not be treated as approved guidance."
        ),
    }

@app.get("/demo", include_in_schema=False)
def demo():
    return FileResponse(ROOT / "demo/index.html")


# ============================================================
# COLLECTION FACILITY RECOMMENDATIONS
# ============================================================

from api.collection_recommender import (
    recommend_collection_facilities,
    FacilityDataError,
)


@app.get("/recommendations/collection-points")
def get_collection_point_recommendations(
    material: str,
    condition: str,
    quantity_kg: float,
    latitude: float,
    longitude: float,
):
    """Recommend verified collection facilities using JijiGreen priority."""

    try:
        return recommend_collection_facilities(
            material=material,
            condition=condition,
            quantity_kg=quantity_kg,
            user_latitude=latitude,
            user_longitude=longitude,
        )

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="A required facility dataset is unavailable.",
        )

    except FacilityDataError:
        raise HTTPException(
            status_code=500,
            detail="Facility dataset validation failed.",
        )
