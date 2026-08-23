#!/usr/bin/env python3
"""
THEME PHOTO — Riddhi Siddhi Gift & Pack
Converts ANY photo into a web-ready image matching this website's premium theme.

HOW TO USE (Terminal):
    python3 theme-photo.py IMG_0738.png          -> natural look, resized + sharp
    python3 theme-photo.py IMG_0738.png --luxe   -> adds navy/gold premium colour grade

Output is saved automatically as photo-13.jpg, photo-14.jpg ... (next free number).
Then add it to index.html inside #galleryGrid like the other figures.
"""

import glob
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageEnhance

MAX_SIZE = 1600
QUALITY = 84

NAVY_SHADOW = np.array([13, 19, 52], dtype=np.float32)   # matches site navy-800
GOLD_HIGHLIGHT = np.array([240, 212, 138], dtype=np.float32)


def convert_heic(src):
    """iPhone HEIC photos -> JPG using macOS built-in sips."""
    tmp = tempfile.mktemp(suffix=".jpg")
    subprocess.run(["sips", "-s", "format", "jpeg", src, "--out", tmp],
                   check=True, capture_output=True)
    return tmp


def load_image(path):
    if path.lower().endswith(".heic"):
        path = convert_heic(path)
    img = Image.open(path).convert("RGB")
    img.thumbnail((MAX_SIZE, MAX_SIZE), Image.LANCZOS)
    return img


def natural(img):
    """Clean, realistic web version - keeps original colours."""
    out = ImageEnhance.Contrast(img).enhance(1.04)
    out = ImageEnhance.Sharpness(out).enhance(1.15)
    out = ImageEnhance.Color(out).enhance(1.05)
    return out


def luxe(img):
    """Premium grade: navy shadows + warm gold highlights + soft vignette.
    Subtle on purpose so the photo stays realistic."""
    arr = np.asarray(img).astype(np.float32)
    lum = (arr / 255.0) @ np.array([0.299, 0.587, 0.114])

    shadow_t = np.clip(1.0 - lum * 2.0, 0, 1) ** 1.4
    high_t = np.clip((lum - 0.45) * 2.0, 0, 1) ** 1.4

    for c in range(3):
        ch = arr[..., c]
        ch += 0.28 * shadow_t * (NAVY_SHADOW[c] - ch)
        ch += 0.16 * high_t * (GOLD_HIGHLIGHT[c] - ch)

    arr *= 0.96

    h, w = lum.shape
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2) / 1.4142
    arr *= (1.0 - 0.18 * np.clip(d - 0.55, 0, 1) ** 1.6)[..., None]

    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    out = ImageEnhance.Sharpness(out).enhance(1.12)
    return out


def next_photo_name():
    nums = [int(m.group(1)) for f in glob.glob("photo-*.jpg")
            if (m := re.search(r"photo-(\d+)\.jpg$", f))]
    return f"photo-{max(nums) + 1}.jpg" if nums else "photo-1.jpg"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}

    if not args:
        print(__doc__)
        sys.exit(1)

    src = args[0]
    if not os.path.exists(src):
        print(f"ERROR: file not found: {src}")
        sys.exit(1)

    img = load_image(src)
    img = luxe(img) if "--luxe" in flags else natural(img)

    out_name = next_photo_name()
    img.save(out_name, "JPEG", quality=QUALITY, optimize=True, progressive=True)

    kb = os.path.getsize(out_name) // 1024
    print(f"DONE  ->  {out_name}  ({img.width}x{img.height}, {kb} KB)")
    print("Next: add it to index.html inside #galleryGrid.")


if __name__ == "__main__":
    main()
