from pathlib import Path
import json
import csv
import math

import numpy as np
import tensorflow as tf
from PIL import Image, ImageDraw

# -----------------------------
# 1. Configuration
# -----------------------------

PROJECT_DIR = Path(__file__).resolve().parent.parent

MODEL_PATH = PROJECT_DIR / "models/jijigreen_mobilenetv2.keras"
LABELS_PATH = PROJECT_DIR / "models/class_names.json"
TEST_DIR = PROJECT_DIR / "dataset/processed/test"

OUTPUT_DIR = PROJECT_DIR / "models/error_analysis"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_SIZE = (224, 224)
BATCH_SIZE = 16

tf.config.threading.set_intra_op_parallelism_threads(2)
tf.config.threading.set_inter_op_parallelism_threads(2)

# -----------------------------
# 2. Load model and labels
# -----------------------------

with open(LABELS_PATH) as file:
    class_names = json.load(file)

model = tf.keras.models.load_model(MODEL_PATH)

test_ds = tf.keras.utils.image_dataset_from_directory(
    TEST_DIR,
    image_size=IMAGE_SIZE,
    batch_size=BATCH_SIZE,
    label_mode="int",
    class_names=class_names,
    shuffle=False
)

# -----------------------------
# 3. Generate predictions
# -----------------------------

print("Analyzing test images...")

probabilities = model.predict(test_ds, verbose=1)

predictions = np.argmax(probabilities, axis=1)

true_labels = np.concatenate([
    labels.numpy() for _, labels in test_ds
])

image_paths = test_ds.file_paths

# -----------------------------
# 4. Find incorrect predictions
# -----------------------------

mistakes = []

for index, (actual, predicted) in enumerate(
    zip(true_labels, predictions)
):
    if actual == predicted:
        continue

    confidence = float(probabilities[index][predicted])
    actual_probability = float(probabilities[index][actual])

    mistakes.append({
        "path": image_paths[index],
        "actual": class_names[actual],
        "predicted": class_names[predicted],
        "confidence": confidence,
        "actual_probability": actual_probability
    })

print(f"\nIncorrect predictions: {len(mistakes)}")

# -----------------------------
# 5. Save CSV report
# -----------------------------

csv_path = OUTPUT_DIR / "misclassifications.csv"

with open(csv_path, "w", newline="") as file:
    writer = csv.DictWriter(
        file,
        fieldnames=[
            "path",
            "actual",
            "predicted",
            "confidence",
            "actual_probability"
        ]
    )

    writer.writeheader()

    for mistake in mistakes:
        writer.writerow(mistake)

print("CSV report saved:", csv_path)

# -----------------------------
# 6. Generate contact sheet
# -----------------------------

columns = 4
cell_width = 220
cell_height = 190

rows = max(1, math.ceil(len(mistakes) / columns))

sheet = Image.new(
    "RGB",
    (columns * cell_width, rows * cell_height),
    "white"
)

draw = ImageDraw.Draw(sheet)

for index, mistake in enumerate(mistakes):

    image = Image.open(mistake["path"]).convert("RGB")
    image.thumbnail((190, 130))

    col = index % columns
    row = index // columns

    x = col * cell_width + 15
    y = row * cell_height + 5

    sheet.paste(image, (x, y))

    label = (
        f"Actual: {mistake['actual']}\n"
        f"Predicted: {mistake['predicted']}\n"
        f"Confidence: {mistake['confidence']:.1%}"
    )

    draw.multiline_text(
        (x, y + 135),
        label,
        fill="black",
        spacing=3
    )

image_path = OUTPUT_DIR / "misclassified_images.jpg"

sheet.save(image_path, quality=90)

print("Contact sheet saved:", image_path)

# -----------------------------
# 7. Summarize common mistakes
# -----------------------------

print("\nMost common classification errors:")

error_counts = {}

for mistake in mistakes:
    pair = (
        mistake["actual"],
        mistake["predicted"]
    )

    error_counts[pair] = error_counts.get(pair, 0) + 1

for (actual, predicted), count in sorted(
    error_counts.items(),
    key=lambda item: item[1],
    reverse=True
):
    print(f"{actual:12} -> {predicted:12}: {count}")

print("\nError analysis completed.")
