from pathlib import Path
from PIL import Image
import csv
import hashlib

ROOT = Path("experiments/brand_recognition")
APPROVED = ROOT / "dataset" / "approved"
INCOMING = ROOT / "dataset" / "incoming"
METADATA = ROOT / "metadata" / "brand_images.csv"

# Only the two classes selected for the hackathon experiment.
CLASSES = {"coca_cola_family", "predator"}
VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

issues = []
approved_files = []
incoming_files = []
seen_approved_hashes = {}

def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()

def collect_images(folder, destination, category=None):
    if not folder.exists():
        return

    for path in folder.rglob("*"):
        if path.is_file():
            destination.append((path, category))

# Collect approved images by brand.
for category in CLASSES:
    collect_images(APPROVED / category, approved_files, category)

# Collect incoming images separately.
collect_images(INCOMING, incoming_files)

# Load annotation metadata.
metadata_rows = {}

if METADATA.exists():
    with METADATA.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            filename = row.get("filename", "").strip()
            if filename:
                metadata_rows[filename] = row
else:
    issues.append(f"Metadata file missing: {METADATA}")

def check_image(path):
    if path.suffix.lower() not in VALID_EXTENSIONS:
        issues.append(f"Unsupported file: {path}")
        return None

    try:
        with Image.open(path) as image:
            image.verify()

        with Image.open(path) as image:
            width, height = image.size

        if width < 200 or height < 200:
            issues.append(f"Low resolution ({width}x{height}): {path}")

        return file_hash(path)

    except Exception as error:
        issues.append(f"Unreadable image: {path} ({error})")
        return None

print("\nJIJIGREEN BRAND DATASET AUDIT")
print("=" * 45)

print("\nCOLLECTION COUNTS")
print("-" * 45)
print("Approved images:", len(approved_files))
print("Incoming images:", len(incoming_files))

# Audit approved images and detect duplicates only within approved.
print("\nAPPROVED DATASET CHECK")
print("-" * 45)

for path, category in approved_files:
    digest = check_image(path)

    if digest is not None:
        if digest in seen_approved_hashes:
            issues.append(
                f"Duplicate within approved dataset: {path} == "
                f"{seen_approved_hashes[digest]}"
            )
        else:
            seen_approved_hashes[digest] = path

    row = metadata_rows.get(path.name)

    if row is None:
        issues.append(f"Missing metadata: {path.name}")
    elif row.get("brand_label", "").strip() != category:
        issues.append(
            f"Folder/label mismatch: {path.name} "
            f"(folder={category}, "
            f"metadata={row.get('brand_label')})"
        )
    elif row.get("review_status", "").strip() != "approved":
        issues.append(
            f"Image in approved folder but status is not approved: "
            f"{path.name}"
        )

# Audit incoming files technically, without comparing them to approved.
print("\nINCOMING IMAGE CHECK")
print("-" * 45)

for path, _ in incoming_files:
    check_image(path)

# Count approved images per class.
print("\nAPPROVED CLASS COUNTS")
print("-" * 45)

for category in sorted(CLASSES):
    count = sum(1 for _, label in approved_files if label == category)
    print(f"{category}: {count}")

print("\nAUDIT RESULTS")
print("-" * 45)

if issues:
    for issue in issues:
        print("-", issue)
else:
    print("No technical or metadata issues detected.")

print("\nApproved images checked:", len(approved_files))
print("Incoming images checked:", len(incoming_files))
print("Issues found:", len(issues))
print("\nNote: Incoming originals are not compared against approved copies.")
print("This audit does not visually verify brand labels.")
