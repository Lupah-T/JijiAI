import csv
import json
from pathlib import Path

import numpy as np
import tensorflow as tf

from tensorflow.keras import layers, models
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.callbacks import (
    EarlyStopping,
    ModelCheckpoint,
    ReduceLROnPlateau,
)

ROOT = Path("experiments/brand_recognition")
MANIFEST = ROOT / "metadata/brand_split_manifest.csv"
MODEL_DIR = ROOT / "models"
REPORT_DIR = ROOT / "reports"

MODEL_DIR.mkdir(parents=True, exist_ok=True)
REPORT_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_SIZE = (224, 224)
BATCH_SIZE = 4
EPOCHS = 25
SEED = 42

tf.keras.utils.set_random_seed(SEED)

# Keep class order fixed and documented.
CLASS_NAMES = ["coca_cola_family", "predator"]
CLASS_TO_INDEX = {
    name: index for index, name in enumerate(CLASS_NAMES)
}

# Read the verified manifest.
records = []

with MANIFEST.open(newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        if row["brand_label"] not in CLASS_TO_INDEX:
            continue

        records.append({
            "filepath": row["filepath"],
            "label": CLASS_TO_INDEX[row["brand_label"]],
            "split": row["split"],
        })

train_records = [r for r in records if r["split"] == "train"]
val_records = [r for r in records if r["split"] == "validation"]

if not train_records or not val_records:
    raise ValueError("Training or validation data is missing.")

for split_name, split_records in [
    ("training", train_records),
    ("validation", val_records),
]:
    counts = np.bincount(
        [r["label"] for r in split_records],
        minlength=len(CLASS_NAMES)
    )

    print(f"{split_name.title()} images: {len(split_records)}")

    for index, name in enumerate(CLASS_NAMES):
        print(f"  {name}: {counts[index]}")

# Build image datasets.
def load_image(filepath, label):
    image_bytes = tf.io.read_file(filepath)
    image = tf.io.decode_jpeg(image_bytes, channels=3)
    image = tf.image.resize(image, IMAGE_SIZE)
    image = tf.cast(image, tf.float32)

    return image, label


def make_dataset(split_records, training=False):
    paths = [r["filepath"] for r in split_records]
    labels = [r["label"] for r in split_records]

    dataset = tf.data.Dataset.from_tensor_slices((paths, labels))

    if training:
        dataset = dataset.shuffle(
            len(paths), seed=SEED, reshuffle_each_iteration=True
        )

    dataset = dataset.map(
        load_image,
        num_parallel_calls=tf.data.AUTOTUNE
    )

    dataset = dataset.batch(BATCH_SIZE)
    dataset = dataset.prefetch(tf.data.AUTOTUNE)

    return dataset


train_ds = make_dataset(train_records, training=True)
val_ds = make_dataset(val_records)

# Mild augmentation. No horizontal flipping.
augmentation = models.Sequential([
    layers.RandomRotation(0.04),
    layers.RandomZoom(0.08),
    layers.RandomTranslation(0.04, 0.04),
    layers.RandomContrast(0.10),
], name="image_augmentation")

# Load frozen pretrained MobileNetV2.
weights = (
    Path.home() / ".keras" / "models" /
    "mobilenet_v2_weights_tf_dim_ordering_tf_kernels_1.0_224_no_top.h5"
)

if not weights.is_file():
    raise FileNotFoundError(f"Missing pretrained weights: {weights}")

base_model = MobileNetV2(
    input_shape=(224, 224, 3),
    include_top=False,
    weights=str(weights)
)

base_model.trainable = False

# Build the classification model.
inputs = layers.Input(shape=(224, 224, 3))

x = augmentation(inputs)
x = layers.Rescaling(
    scale=1.0 / 127.5,
    offset=-1
)(x)

x = base_model(x, training=False)
x = layers.GlobalAveragePooling2D()(x)
x = layers.Dropout(0.30)(x)

outputs = layers.Dense(
    len(CLASS_NAMES),
    activation="softmax"
)(x)

model = models.Model(inputs, outputs, name="jijigreen_brand_mobilenetv2")

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=0.0005),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"]
)

best_model_path = MODEL_DIR / "brand_mobilenetv2_best.keras"

callbacks = [
    ModelCheckpoint(
        filepath=str(best_model_path),
        monitor="val_loss",
        save_best_only=True,
        verbose=1
    ),
    EarlyStopping(
        monitor="val_loss",
        patience=6,
        restore_best_weights=True,
        verbose=1
    ),
    ReduceLROnPlateau(
        monitor="val_loss",
        factor=0.5,
        patience=3,
        min_lr=0.00001,
        verbose=1
    )
]

print("\nMODEL SUMMARY")
model.summary()

print("\nSTARTING BRAND MODEL TRAINING")
print("Frozen MobileNetV2 + trainable classification head")
print("Training runs on CPU if no compatible GPU is available.")

history = model.fit(
    train_ds,
    validation_data=val_ds,
    epochs=EPOCHS,
    callbacks=callbacks,
    verbose=1
)

# Save class mapping.
with (MODEL_DIR / "class_mapping.json").open("w") as f:
    json.dump(CLASS_TO_INDEX, f, indent=4)

# Save training history.
history_path = REPORT_DIR / "training_history.csv"

with history_path.open("w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["epoch", "loss", "accuracy", "val_loss", "val_accuracy"])

    for i in range(len(history.history["loss"])):
        writer.writerow([
            i + 1,
            history.history["loss"][i],
            history.history["accuracy"][i],
            history.history["val_loss"][i],
            history.history["val_accuracy"][i],
        ])

print("\nTRAINING COMPLETE")
print("Best model:", best_model_path)
print("Class mapping:", MODEL_DIR / "class_mapping.json")
print("Training history:", history_path)
