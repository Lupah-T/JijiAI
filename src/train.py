from pathlib import Path
import json
import numpy as np
import tensorflow as tf

from sklearn.utils.class_weight import compute_class_weight


# -----------------------------
# 1. Configuration
# -----------------------------

PROJECT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_DIR / "dataset" / "processed"
MODEL_DIR = PROJECT_DIR / "models"

MODEL_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_SIZE = (224, 224)
BATCH_SIZE = 16
EPOCHS = 15
SEED = 42

tf.keras.utils.set_random_seed(SEED)

# Limit CPU thread usage.
tf.config.threading.set_intra_op_parallelism_threads(2)
tf.config.threading.set_inter_op_parallelism_threads(2)


# -----------------------------
# 2. Load datasets
# -----------------------------

print("Loading datasets...")

train_ds = tf.keras.utils.image_dataset_from_directory(
    DATA_DIR / "train",
    image_size=IMAGE_SIZE,
    batch_size=BATCH_SIZE,
    label_mode="int",
    shuffle=True,
    seed=SEED
)

class_names = train_ds.class_names

val_ds = tf.keras.utils.image_dataset_from_directory(
    DATA_DIR / "validation",
    image_size=IMAGE_SIZE,
    batch_size=BATCH_SIZE,
    label_mode="int",
    class_names=class_names,
    shuffle=False
)

print("\nClasses:", class_names)

AUTOTUNE = tf.data.AUTOTUNE

train_ds = train_ds.prefetch(AUTOTUNE)
val_ds = val_ds.prefetch(AUTOTUNE)


# -----------------------------
# 3. Handle class imbalance
# -----------------------------

counts = []

for category in class_names:
    folder = DATA_DIR / "train" / category
    count = sum(1 for f in folder.iterdir() if f.is_file())
    counts.append(count)

class_weights = compute_class_weight(
    class_weight="balanced",
    classes=np.arange(len(class_names)),
    y=np.repeat(
        np.arange(len(class_names)),
        counts
    )
)

class_weights = {
    index: float(weight)
    for index, weight in enumerate(class_weights)
}

print("\nClass weights:")
for index, category in enumerate(class_names):
    print(f"{category}: {class_weights[index]:.3f}")


# -----------------------------
# 4. Data augmentation
# -----------------------------

augmentation = tf.keras.Sequential([
    tf.keras.layers.RandomFlip("horizontal"),
    tf.keras.layers.RandomRotation(0.08),
    tf.keras.layers.RandomZoom(0.10),
], name="data_augmentation")


# -----------------------------
# 5. Load MobileNetV2
# -----------------------------

print("\nLoading pretrained MobileNetV2...")

base_model = tf.keras.applications.MobileNetV2(
    input_shape=(224, 224, 3),
    include_top=False,
    weights="imagenet"
)

base_model.trainable = False


# -----------------------------
# 6. Build classification model
# -----------------------------

inputs = tf.keras.Input(shape=(224, 224, 3))

x = augmentation(inputs)

# MobileNetV2 expects pixel values between -1 and 1.
x = tf.keras.layers.Rescaling(
    scale=1.0 / 127.5,
    offset=-1
)(x)

x = base_model(x, training=False)

x = tf.keras.layers.GlobalAveragePooling2D()(x)

x = tf.keras.layers.Dropout(0.25)(x)

outputs = tf.keras.layers.Dense(
    len(class_names),
    activation="softmax"
)(x)

model = tf.keras.Model(inputs, outputs)


# -----------------------------
# 7. Compile model
# -----------------------------

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"]
)

model.summary()


# -----------------------------
# 8. Training callbacks
# -----------------------------

model_path = MODEL_DIR / "jijigreen_mobilenetv2.keras"

callbacks = [
    tf.keras.callbacks.ModelCheckpoint(
        filepath=str(model_path),
        monitor="val_loss",
        save_best_only=True,
        verbose=1
    ),

    tf.keras.callbacks.EarlyStopping(
        monitor="val_loss",
        patience=4,
        restore_best_weights=True,
        verbose=1
    ),

    tf.keras.callbacks.ReduceLROnPlateau(
        monitor="val_loss",
        factor=0.2,
        patience=2,
        min_lr=0.00001,
        verbose=1
    )
]


# -----------------------------
# 9. Train
# -----------------------------

print("\nStarting training...")

history = model.fit(
    train_ds,
    validation_data=val_ds,
    epochs=EPOCHS,
    class_weight=class_weights,
    callbacks=callbacks
)


# -----------------------------
# 10. Save class labels
# -----------------------------

labels_path = MODEL_DIR / "class_names.json"

with open(labels_path, "w") as file:
    json.dump(class_names, file, indent=4)

print("\nTraining completed.")
print("Best model:", model_path)
print("Class labels:", labels_path)
