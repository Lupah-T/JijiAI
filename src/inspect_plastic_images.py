from pathlib import Path
from PIL import Image, ImageDraw
import math

source = Path("dataset/raw/plastic")
output = Path("models/plastic_contact_sheet.jpg")

files = sorted(
    p for p in source.iterdir()
    if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
)

if not files:
    print("No images found. Checking processed training images instead.")
    source = Path("dataset/processed/train/plastic")
    files = sorted(
        p for p in source.iterdir()
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )

thumb_width = 140
thumb_height = 125
label_height = 25
columns = 6
rows = math.ceil(len(files) / columns)

sheet = Image.new(
    "RGB",
    (columns * thumb_width, rows * (thumb_height + label_height)),
    "white"
)

draw = ImageDraw.Draw(sheet)

for index, path in enumerate(files):
    try:
        image = Image.open(path).convert("RGB")
        image.thumbnail((thumb_width - 8, thumb_height - 8))

        x = (index % columns) * thumb_width
        y = (index // columns) * (thumb_height + label_height)

        sheet.paste(image, (x + 4, y + 4))
        draw.text(
            (x + 4, y + thumb_height),
            f"ID {index + 1}: {path.name[:13]}",
            fill="black"
        )
    except Exception as error:
        print("Skipped:", path.name, error)

output.parent.mkdir(parents=True, exist_ok=True)
sheet.save(output, quality=90)

print("Images:", len(files))
print("Contact sheet:", output)
