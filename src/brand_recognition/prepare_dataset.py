import csv
from pathlib import Path
from collections import Counter

from sklearn.model_selection import StratifiedGroupKFold

ROOT = Path("experiments/brand_recognition")
METADATA = ROOT / "metadata/brand_images.csv"
OUTPUT = ROOT / "metadata/brand_split_manifest.csv"
APPROVED = ROOT / "dataset/approved"

ALLOWED_BRANDS = {"coca_cola_family", "predator"}

# Load and validate approved records.
records = []

with METADATA.open(newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        if row["review_status"] != "approved":
            continue

        brand = row["brand_label"]
        if brand not in ALLOWED_BRANDS:
            continue

        path = APPROVED / brand / row["filename"]

        if not path.is_file():
            raise FileNotFoundError(f"Missing image: {path}")

        if not row["physical_item_id"]:
            raise ValueError(f"Missing physical_item_id: {row['image_id']}")

        records.append({
            "image_id": row["image_id"],
            "filename": row["filename"],
            "brand_label": brand,
            "product_variant": row["product_variant"],
            "physical_item_id": row["physical_item_id"],
            "filepath": str(path),
        })

if not records:
    raise ValueError("No approved images found.")

labels = [r["brand_label"] for r in records]
groups = [r["physical_item_id"] for r in records]

# First split: approximately 20% of physical bottles for testing.
outer = StratifiedGroupKFold(
    n_splits=5, shuffle=True, random_state=42
)

train_val_idx, test_idx = next(
    outer.split(records, labels, groups)
)

# Second split: approximately 20% of the remaining bottles for validation.
train_val_records = [records[i] for i in train_val_idx]
train_val_labels = [labels[i] for i in train_val_idx]
train_val_groups = [groups[i] for i in train_val_idx]

inner = StratifiedGroupKFold(
    n_splits=5, shuffle=True, random_state=42
)

train_idx, val_idx = next(
    inner.split(train_val_records, train_val_labels, train_val_groups)
)

splits = {}

for i in train_idx:
    splits[train_val_idx[i]] = "train"

for i in val_idx:
    splits[train_val_idx[i]] = "validation"

for i in test_idx:
    splits[i] = "test"

# Verify that no physical bottle crosses splits.
group_splits = {}

for i, split in splits.items():
    item_id = records[i]["physical_item_id"]
    group_splits.setdefault(item_id, set()).add(split)

leaks = {
    item: values
    for item, values in group_splits.items()
    if len(values) > 1
}

if leaks:
    raise RuntimeError(f"Data leakage detected: {leaks}")

# Write the manifest.
fields = [
    "image_id", "filename", "brand_label",
    "product_variant", "physical_item_id",
    "split", "filepath"
]

with OUTPUT.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()

    for i, record in enumerate(records):
        writer.writerow({
            **record,
            "split": splits[i]
        })

print("JIJIGREEN BRAND DATASET SPLIT")
print("=" * 40)
print("Total approved images:", len(records))
print("Distinct physical bottles:", len(group_splits))

for split in ["train", "validation", "test"]:
    selected = [
        (records[i]["brand_label"], records[i]["physical_item_id"])
        for i in splits
        if splits[i] == split
    ]

    print(f"\n{split.upper()}")
    print("Images:", len(selected))
    print("Distinct bottles:", len(set(item for _, item in selected)))

    for brand, count in sorted(Counter(b for b, _ in selected).items()):
        print(f"  {brand}: {count} images")

print("\nLeakage check:", "PASSED" if not leaks else "FAILED")
print("Manifest:", OUTPUT)
