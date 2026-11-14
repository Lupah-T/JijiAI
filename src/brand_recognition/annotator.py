import csv
import hashlib
import shutil
import tkinter as tk
from tkinter import ttk, messagebox
from pathlib import Path
from PIL import Image, ImageTk

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "experiments/brand_recognition"
INCOMING = BASE / "dataset/incoming"
APPROVED = BASE / "dataset/approved"
UNIDENTIFIED = BASE / "dataset/unidentified"
REJECTED = BASE / "dataset/rejected"
METADATA = BASE / "metadata/brand_images.csv"
TRACKER = BASE / "collection_tracker.csv"
PROCESSED = BASE / "metadata/processed_images.txt"

FIELDS = [
    "image_id", "filename", "brand_label", "product_variant",
    "packaging_material", "packaging_type", "physical_item_id",
    "brand_visibility", "condition", "background",
    "contributor_code", "review_status", "notes"
]

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

for folder in [INCOMING, APPROVED, UNIDENTIFIED, REJECTED]:
    folder.mkdir(parents=True, exist_ok=True)

METADATA.parent.mkdir(parents=True, exist_ok=True)

if not METADATA.exists():
    with METADATA.open("w", newline="") as f:
        csv.DictWriter(f, fieldnames=FIELDS).writeheader()

if not PROCESSED.exists():
    PROCESSED.touch()

def read_rows(path):
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def processed_names():
    return set(PROCESSED.read_text(encoding="utf-8").splitlines())

def approved_hashes():
    hashes = set()
    for folder in APPROVED.iterdir():
        if folder.is_dir():
            for p in folder.iterdir():
                if p.is_file() and p.suffix.lower() in EXTENSIONS:
                    try:
                        hashes.add(digest(p))
                    except OSError:
                        pass
    return hashes

def next_image_id():
    rows = read_rows(METADATA)
    numbers = []
    for row in rows:
        value = row.get("image_id", "")
        if value.startswith("B") and value[1:].isdigit():
            numbers.append(int(value[1:]))
    return f"B{max(numbers, default=0) + 1:04d}"

class Annotator:
    def __init__(self, window):
        self.window = window
        self.window.title("JijiGreen — Brand Image Annotator")
        self.window.geometry("1050x760")
        self.window.minsize(850, 650)

        self.images = sorted(
            p for p in INCOMING.iterdir()
            if p.is_file() and p.suffix.lower() in EXTENSIONS
        )
        done = processed_names()
        self.images = [p for p in self.images if p.name not in done]
        self.index = 0
        self.photo = None

        self.brand = tk.StringVar(value="coca_cola_family")
        self.variant = tk.StringVar(value="coca_cola")
        self.material = tk.StringVar(value="plastic")
        self.packaging = tk.StringVar(value="bottle")
        self.item_id = tk.StringVar()
        self.visibility = tk.StringVar(value="clear")
        self.condition = tk.StringVar(value="used")
        self.background = tk.StringVar(value="outdoor_natural")
        self.notes = tk.StringVar()

        self.build_ui()
        self.show_image()

    def build_ui(self):
        main = ttk.Frame(self.window, padding=12)
        main.pack(fill="both", expand=True)

        ttk.Label(
            main, text="JIJIGREEN BRAND RECOGNITION",
            font=("Arial", 18, "bold")
        ).pack(anchor="w")

        self.counter = ttk.Label(main, text="", font=("Arial", 10))
        self.counter.pack(anchor="w", pady=(4, 10))

        content = ttk.Frame(main)
        content.pack(fill="both", expand=True)

        self.preview = ttk.Label(
            content, text="No image selected",
            anchor="center", relief="solid"
        )
        self.preview.pack(side="left", fill="both", expand=True, padx=(0, 15))

        form = ttk.Frame(content, width=350)
        form.pack(side="right", fill="y")
        form.pack_propagate(False)

        def field(label, variable, values=None):
            ttk.Label(form, text=label).pack(anchor="w", pady=(7, 2))
            if values:
                widget = ttk.Combobox(
                    form, textvariable=variable,
                    values=values, state="readonly"
                )
            else:
                widget = ttk.Entry(form, textvariable=variable)
            widget.pack(fill="x")

        field("Brand", self.brand, ["coca_cola_family", "predator"])
        field("Product variant", self.variant)
        field("Packaging material", self.material,
              ["plastic", "glass", "aluminium", "paper", "unknown"])
        field("Packaging type", self.packaging,
              ["bottle", "can", "bag", "wrapper", "other"])
        field("Physical item ID", self.item_id)
        field("Brand visibility", self.visibility,
              ["clear", "partial", "unclear"])
        field("Condition", self.condition,
              ["new", "used", "damaged", "dirty"])
        field("Background", self.background,
              ["outdoor_natural", "indoor", "plain", "mixed", "other"])
        field("Notes", self.notes)

        ttk.Label(
            form,
            text="Use the same physical item ID for multiple views "
                 "of the same bottle.",
            wraplength=330,
            foreground="#555"
        ).pack(anchor="w", pady=10)

        actions = ttk.Frame(form)
        actions.pack(fill="x", pady=8)

        ttk.Button(
            actions, text="Approve",
            command=self.approve
        ).pack(fill="x", pady=3)

        ttk.Button(
            actions, text="Unidentified",
            command=self.unidentified
        ).pack(fill="x", pady=3)

        ttk.Button(
            actions, text="Reject",
            command=self.reject
        ).pack(fill="x", pady=3)

        ttk.Button(
            actions, text="Skip image",
            command=self.next_image
        ).pack(fill="x", pady=3)

        ttk.Label(
            main,
            text="Original files remain in incoming. Approved files are copied.",
            foreground="#555"
        ).pack(anchor="w", pady=(10, 0))

    def show_image(self):
        if self.index >= len(self.images):
            self.preview.configure(
                image="", text="All incoming images processed!"
            )
            self.counter.configure(
                text="No remaining unprocessed images."
            )
            self.photo = None
            return

        path = self.images[self.index]
        self.counter.configure(
            text=f"Image {self.index + 1} of {len(self.images)}: {path.name}"
        )

        try:
            image = Image.open(path).convert("RGB")
            image.thumbnail((650, 620))
            self.photo = ImageTk.PhotoImage(image)
            self.preview.configure(image=self.photo, text="")
        except Exception as exc:
            self.preview.configure(
                image="", text=f"Cannot open image:\n{exc}"
            )

        self.brand.set("coca_cola_family")
        self.variant.set("coca_cola")
        self.material.set("plastic")
        self.packaging.set("bottle")
        self.item_id.set("")
        self.visibility.set("clear")
        self.condition.set("used")
        self.background.set("outdoor_natural")
        self.notes.set("")

    def record_processed(self, source):
        with PROCESSED.open("a", encoding="utf-8") as f:
            f.write(source.name + "\n")

    def save_row(self, row):
        with METADATA.open("a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDS)
            writer.writerow(row)

    def copy_unique(self, source, destination):
        destination.mkdir(parents=True, exist_ok=True)
        target = destination / source.name
        number = 1
        while target.exists():
            target = destination / f"{source.stem}_{number}{source.suffix}"
            number += 1
        shutil.copy2(source, target)
        return target

    def advance(self):
        self.index += 1
        self.show_image()

    def approve(self):
        if self.index >= len(self.images):
            return

        source = self.images[self.index]

        if self.brand.get() not in ["coca_cola_family", "predator"]:
            messagebox.showerror("Invalid brand", "Choose a valid brand.")
            return

        if not self.item_id.get().strip():
            messagebox.showwarning(
                "Missing physical item ID",
                "Enter an ID such as COKE_001 or PRED_001."
            )
            return

        if self.visibility.get() == "unclear":
            messagebox.showwarning(
                "Unclear branding",
                "Use Unidentified for images with unclear branding."
            )
            return

        try:
            image_hash = digest(source)
            if image_hash in approved_hashes():
                messagebox.showwarning(
                    "Duplicate image",
                    "An identical image is already approved."
                )
                return

            label = self.brand.get()
            target = self.copy_unique(source, APPROVED / label)

            row = {
                "image_id": next_image_id(),
                "filename": target.name,
                "brand_label": label,
                "product_variant": self.variant.get().strip(),
                "packaging_material": self.material.get(),
                "packaging_type": self.packaging.get(),
                "physical_item_id": self.item_id.get().strip(),
                "brand_visibility": self.visibility.get(),
                "condition": self.condition.get(),
                "background": self.background.get(),
                "contributor_code": "",
                "review_status": "approved",
                "notes": self.notes.get().strip()
            }

            self.save_row(row)
            self.record_processed(source)
            self.update_tracker()
            self.advance()

        except Exception as exc:
            messagebox.showerror("Save failed", str(exc))

    def unidentified(self):
        self.finish_non_approved("unidentified", UNIDENTIFIED)

    def reject(self):
        self.finish_non_approved("rejected", REJECTED)

    def finish_non_approved(self, status, destination):
        if self.index >= len(self.images):
            return

        source = self.images[self.index]

        if not messagebox.askyesno(
            "Confirm", f"Mark this image as {status}?"
        ):
            return

        try:
            self.copy_unique(source, destination)
            row = {
                "image_id": next_image_id(),
                "filename": source.name,
                "brand_label": "",
                "product_variant": "",
                "packaging_material": self.material.get(),
                "packaging_type": self.packaging.get(),
                "physical_item_id": self.item_id.get().strip(),
                "brand_visibility": self.visibility.get(),
                "condition": self.condition.get(),
                "background": self.background.get(),
                "contributor_code": "",
                "review_status": status,
                "notes": self.notes.get().strip()
            }
            self.save_row(row)
            self.record_processed(source)
            self.advance()
        except Exception as exc:
            messagebox.showerror("Save failed", str(exc))

    def update_tracker(self):
        if not TRACKER.exists():
            return

        rows = read_rows(TRACKER)
        approved = read_rows(METADATA)

        for row in rows:
            label = row["brand_label"]
            row["images_received"] = sum(
                1 for image in approved
                if image["brand_label"] == label
            )
            row["images_approved"] = sum(
                1 for image in approved
                if image["brand_label"] == label
                and image["review_status"] == "approved"
            )

        with TRACKER.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(
                f, fieldnames=[
                    "brand_label", "target_images",
                    "images_received", "images_approved"
                ]
            )
            writer.writeheader()
            writer.writerows(rows)

    def next_image(self):
        self.advance()


if __name__ == "__main__":
    root = tk.Tk()
    app = Annotator(root)
    root.mainloop()
