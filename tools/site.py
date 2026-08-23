#!/usr/bin/env python3
"""
Riddhi Siddhi Gift & Pack — site maintenance tool.

One place for every repetitive task. Edit the CONFIG block below when
products/photos change, then run:

    python3 tools/site.py photos   Sync photos from the BOX folder into the site
                                   (rename -> convert -> remove Gemini watermark)
    python3 tools/site.py check    Validate products.json + all referenced images

Requirements: pillow, opencv-python-headless  (pip install pillow opencv-python-headless)
"""
import subprocess, shutil, os, sys, json, glob

# ============================ CONFIG ============================
BOX_DIR = "/Users/ganesh159th/Desktop/BOX"

# source path inside BOX_DIR            ->  file name in the website
PHOTO_MAP = [
    ("Jewellery /ALL BOX .jpeg",        "images/jewellery-all-boxes.jpg"),
    ("Jewellery /ALL Box Image.jpeg",   "images/jewellery-all-range.jpg"),
    ("Jewellery /BOX NUMBER 22.png",    "images/jewellery-box-22.jpg"),
    ("Jewellery /BOX NUMBER 222.jpeg",  "images/jewellery-box-222.jpg"),
    ("Jewellery /BOX NUMBER 333.jpeg",  "images/jewellery-box-333.jpg"),
    ("Jewellery /BOX NUMBER 44.jpeg",   "images/jewellery-box-44.jpg"),
    ("Jewellery /BOX NUMBER 444.jpeg",  "images/jewellery-box-444.jpg"),
    ("Jewellery /BOX NUMBER 55.jpeg",   "images/jewellery-box-55.jpg"),
    ("Jewellery /box number 555.jpeg",  "images/jewellery-box-555.jpg"),
    ("Jewellery /BOX NUMBR 666.jpeg",   "images/jewellery-box-666-b.jpg"),
    ("Jewellery /BOX NUMBER 666.jpeg",  "images/jewellery-box-666.jpg"),
    ("Jewellery /box number 77.jpeg",   "images/jewellery-box-77.jpg"),
    ("BOTYANAM/BATYANAM 44.jpeg",       "images/botyanam-44.jpg"),
    ("BOTYANAM/BOTYANAM 55.jpeg",       "images/botyanam-55.jpg"),
    ("BOTYANAM/batyanam 66.jpeg",       "images/botyanam-66.jpg"),
    ("BOTYANAM/BATYANAM 88.jpeg",       "images/botyanam-88.jpg"),
    ("BOTYANAM/BOTYANAM 99.jpeg",       "images/botyanam-99.jpg"),
    ("CONARK SQURE/SQ ALL BOXS.jpeg",   "images/conark-square-all.jpg"),
    ("CONARK SQURE/SQ 55.jpeg",         "images/conark-square-55.jpg"),
    ("CONARK SQURE/SQ 66.jpeg",         "images/conark-square-66.jpg"),
    ("CONARK SQURE/SQ 77.jpeg",         "images/conark-square-77.jpg"),
    ("comandor/COMANDAR 11.jpeg",       "images/comandor-11.jpg"),
    ("comandor/comandor 22.jpeg",       "images/comandor-22.jpg"),
    ("comandor/Comandor 333.jpeg",      "images/comandor-333.jpg"),
    ("comandor/COMANDOR ALL SIZE.jpeg", "images/comandor-all-sizes.jpg"),
]

WATERMARK = {
    "enabled": True,
    "search_zone": (0.50, 0.28),  # fraction of width/height scanned from bottom-right
    "stroke_threshold": 24,        # higher = only very visible marks
    "min_brightness": 110,         # watermark is light-colored on these photos
}
JPEG_QUALITY = 92
# ================================================================


def cmd_photos():
    try:
        import cv2, numpy as np
        from PIL import Image, ImageOps
    except ImportError as e:
        sys.exit(f"Missing dependency: {e}\nRun: pip install pillow opencv-python-headless")

    # 1) copy / convert fresh originals
    for src, dst in PHOTO_MAP:
        s = os.path.join(BOX_DIR, src)
        if not os.path.exists(s):
            print(f"!! missing source, skipped: {src}")
            continue
        if src.lower().endswith(".png"):
            subprocess.run(["sips", "-s", "format", "jpeg", s, "--out", dst], capture_output=True)
        else:
            shutil.copyfile(s, dst)

    if not WATERMARK["enabled"]:
        print("watermark removal disabled in CONFIG — copies are raw")
        return

    # 2) stroke-level inpainting of the watermark (product pixels untouched)
    zwf, zhf = WATERMARK["search_zone"]
    for _, dst in PHOTO_MAP:
        if not os.path.exists(dst):
            continue
        im = Image.open(dst)
        im = ImageOps.exif_transpose(im).convert("RGB")
        W, H = im.size
        zw, zh = int(W * zwf), max(int(H * zhf), 140)
        zx, zy = W - zw, H - zh
        zone = np.array(im.crop((zx, zy, W, H)))

        gray = cv2.cvtColor(zone, cv2.COLOR_RGB2GRAY)
        hp = cv2.absdiff(gray, cv2.GaussianBlur(gray, (0, 0), 9))
        _, m = cv2.threshold(hp, WATERMARK["stroke_threshold"], 255, cv2.THRESH_BINARY)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

        n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
        keep = np.zeros_like(m)
        for i in range(1, n):
            x, y, w, h, area = stats[i]
            comp = lab == i
            if area < 60 or w > zw * 0.95:
                continue
            if gray[comp].mean() > WATERMARK["min_brightness"]:
                keep[comp] = 255
        if keep.sum() == 0:
            im.save(dst, quality=JPEG_QUALITY, optimize=True)
            print(f"{os.path.basename(dst):26s} clean")
            continue

        mask = cv2.dilate(keep, np.ones((5, 5), np.uint8))
        full = np.zeros((H, W), np.uint8)
        full[zy:H, zx:W] = mask
        bgr = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
        out = cv2.cvtColor(cv2.inpaint(bgr, full, 4, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)
        res = np.array(im)
        changed = full > 0
        res[changed] = out[changed]
        Image.fromarray(res).save(dst, quality=JPEG_QUALITY, optimize=True)
        px = int(changed.sum())
        print(f"{os.path.basename(dst):26s} cleaned ({100*px/(W*H):.2f}% of pixels)")


def cmd_check():
    ok = True
    with open("products.json") as f:
        d = json.load(f)
    ids = set()
    for p in d["products"]:
        if p["id"] in ids:
            print(f"DUPLICATE id: {p['id']}"); ok = False
        ids.add(p["id"])
        imgs = p.get("images") or [p.get("image")]
        if not imgs or not imgs[0]:
            print(f"{p['id']}: NO cover image"); ok = False
        for f_ in filter(None, imgs):
            if not os.path.exists(f_):
                print(f"{p['id']}: MISSING image {f_}"); ok = False
    stray = [f for f in glob.glob("images/*.jpg") + glob.glob("images/*.png") + glob.glob("*.jpg") + glob.glob("*.png")
             if not f.startswith(("photo-",)) and f not in {i for _, i in PHOTO_MAP}]
    for s in stray:
        print(f"note: image on disk but not in PHOTO_MAP: {s}")
    print("ALL GOOD ✓" if ok else "PROBLEMS FOUND ✗")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    {"photos": cmd_photos, "check": cmd_check}.get(cmd, lambda: print(
        "usage: python3 tools/site.py [photos|check]"))()
