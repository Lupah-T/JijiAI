from pathlib import Path
import json
import numpy as np
import tensorflow as tf
import matplotlib.pyplot as plt

from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    ConfusionMatrixDisplay,
    accuracy_score
)

# Paths
PROJECT_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = PROJECT_DIR / "models"
TEST_DIR = PROJECT_DIR / "dataset" / "processed" / "test"

MODEL_PATH = MODEL_DIR / "jijigreen_mobilenetv2.keras"
LABELS_PATH = MODEL_DIR / "class_names.json"

IMAGE_SIZE = (224, 224)
BATCH_SIZE = 16

# Limit CPU usage
tf.config.threading.set_intra_op_parallelism_threads(2)
tf.config.threading.set_inter_op_parallelism_threads(2)

# Load class names
with open(LABELS_PATH) as file:
    class_names = json.load(file)

print("Classes:", class_names)

# Load untouched test dataset
test_ds = tf.keras.utils.image_dataset_from_directory(
    TEST_DIR,
    image_size=IMAGE_SIZE,
    batch_size=BATCH_SIZE,
    label_mode="int",
    class_names=class_names,
    shuffle=False
)

# Load trained model
print("\nLoading trained model...")
model = tf.keras.models.load_model(MODEL_PATH)

# Generate predictions
print("\nEvaluating test images...")
probabilities = model.predict(test_ds)
predictions = np.argmax(probabilities, axis=1)

# Get true labels
true_labels = np.concatenate([
    labels.numpy() for _, labels in test_ds
])

# Overall accuracy
accuracy = accuracy_score(true_labels, predictions)

print("\n========== TEST RESULTS ==========")
print(f"Test accuracy: {accuracy * 100:.2f}%")

# Per-class metrics
print("\n========== CLASSIFICATION REPORT ==========")
print(
    classification_report(
        true_labels,
        predictions,
        labels=list(range(len(class_names))),
        target_names=class_names,
        zero_division=0
    )
)

# Confusion matrix
matrix = confusion_matrix(
    true_labels,
    predictions,
    labels=list(range(len(class_names)))
)

print("\n========== CONFUSION MATRIX ==========")
print(matrix)

display = ConfusionMatrixDisplay(
    confusion_matrix=matrix,
    display_labels=class_names
)

fig, ax = plt.subplots(figsize=(9, 8))
display.plot(
    ax=ax,
    cmap="Blues",
    xticks_rotation=45,
    colorbar=False
)

plt.title("JijiGreen Waste Classification - Test Confusion Matrix")
plt.tight_layout()

output_path = MODEL_DIR / "confusion_matrix.png"
plt.savefig(output_path, dpi=150)
plt.close()

print(f"\nConfusion matrix saved to: {output_path}")
