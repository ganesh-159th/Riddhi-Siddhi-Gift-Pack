import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(SCRIPT_DIR, "../public/images");
const OUT_FILE = resolve(OUT_DIR, "og-cover.jpg");

const WIDTH = 1200;
const HEIGHT = 630;

const toDataUri = (relPath) => {
  const absolute = resolve(OUT_DIR, relPath);
  const type = relPath.endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${type};base64,${readFileSync(absolute).toString("base64")}`;
};

const LOGO = toDataUri("../favicon.svg");
const PHOTO_MAIN = toDataUri("jewellery-box-44.jpg");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    font-family: "Playfair Display", Georgia, "Times New Roman", serif;
    background: #05081a;
    color: #f6f2ea;
  }

  .stage {
    position: relative;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    background:
      radial-gradient(560px 380px at 12% 112%, rgba(212,175,55,.20), transparent 65%),
      radial-gradient(520px 320px at 88% -14%, rgba(212,175,55,.16), transparent 60%),
      radial-gradient(700px 500px at 50% 50%, #0a0f2c 0%, #05081a 72%);
  }

  .thin-line {
    position: absolute;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(212,175,55,.45), transparent);
    left: 0;
    right: 0;
  }
  .thin-line.top { top: 24px; }
  .thin-line.bottom { bottom: 24px; }

  .left {
    position: absolute;
    top: 0; left: 0;
    width: 584px; height: ${HEIGHT}px;
    padding: 74px 0 66px 56px;
    display: flex;
    flex-direction: column;
  }

  .brand-row { display: flex; align-items: center; gap: 18px; }
  .logo { width: 56px; height: 56px; }

  .brand-name {
    font-size: 56px;
    font-weight: 800;
    line-height: 1.02;
    letter-spacing: .5px;
    background: linear-gradient(115deg, #f7df8f 0%, #d4af37 35%, #f0c14b 55%, #9a7a1e 78%, #eec44f 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .brand-sub {
    margin-top: 10px;
    font-size: 21px;
    font-weight: 600;
    letter-spacing: .46em;
    color: #eec44f;
    text-transform: uppercase;
  }

  .divider {
    margin: 26px 0 24px;
    width: 120px;
    height: 2px;
    background: linear-gradient(90deg, #d4af37, #6e1530);
  }

  .headline {
    font-size: 30px;
    font-weight: 700;
    line-height: 1.25;
    color: #f6f2ea;
    max-width: 470px;
  }
  .subline {
    margin-top: 12px;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: .04em;
    color: #c9b06a;
  }

  .chips {
    margin-top: 30px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    max-width: 460px;
  }
  .chip {
    padding: 7px 14px;
    border: 1px solid rgba(212,175,55,.55);
    border-radius: 999px;
    color: #eec44f;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: .05em;
  }

  .contact {
    margin-top: auto;
    font-size: 16px;
    letter-spacing: .04em;
    color: #efe8d8;
  }
  .contact b { color: #eec44f; font-weight: 700; }
  .contact .gst {
    margin-top: 5px;
    font-size: 13px;
    letter-spacing: .08em;
    color: #9aa0b8;
  }

  .right {
    position: absolute;
    top: 42px; right: 42px; bottom: 42px;
    width: 528px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 12px;
  }
  .card {
    position: relative;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(212,175,55,.4);
    box-shadow: 0 20px 50px -18px rgba(0,0,0,.75);
    background: #0f1639;
  }
  .card img {
    position: absolute;
    inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
  }
  .card-main { grid-column: 1 / 3; grid-row: 1 / 3; }
  .card.main-overlay {
    background: linear-gradient(90deg, rgba(5,8,26,.72) 0%, rgba(5,8,26,0) 34%);
  }
  .main-tag {
    position: absolute;
    left: 14px; bottom: 14px;
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(5,8,26,.78);
    border: 1px solid rgba(212,175,55,.6);
    color: #eec44f;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="stage">
    <div class="thin-line top"></div>
    <div class="thin-line bottom"></div>

    <div class="left">
      <div class="brand-row">
        <img class="logo" src="${LOGO}" alt="" />
        <div class="brand-name">Riddhi Siddhi</div>
      </div>
      <div class="brand-sub">Gift &amp; Pack</div>

      <div class="divider"></div>

      <div class="headline">Premium Jewellery Box Manufacturer</div>
      <div class="subline">Hyderabad, India &middot; Factory-direct for jewellers &amp; brands</div>

      <div class="chips">
        <span class="chip">Bulk Orders</span>
        <span class="chip">Custom Production</span>
        <span class="chip">Custom Logos</span>
        <span class="chip">Pan-India Delivery</span>
      </div>

      <div class="contact">
        <span><b>&#9742; +91 93467 97060</b></span>
        <div class="gst">GSTIN 36AFMPN3258E1ZB</div>
      </div>
    </div>

    <div class="right">
      <div class="card card-main">
        <img src="${PHOTO_MAIN}" alt="" />
        <div class="card main-overlay"></div>
        <div class="main-tag">B2B Jewellery Packaging</div>
      </div>
    </div>
  </div>
</body>
</html>`;

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const buf = await page.locator(".stage").screenshot({ type: "jpeg", quality: 90 });
    writeFileSync(OUT_FILE, buf);
    console.log(`OG share image written: ${OUT_FILE} (${WIDTH}x${HEIGHT})`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});