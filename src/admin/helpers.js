export function slugify(s) {
  return (
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "product-" + Date.now()
  );
}

export function splitSpecs(s) {
  return String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export const badgeClass = (style) =>
  ({
    gold: "bg-agold-500 text-white",
    wine: "bg-wine-500 text-cream",
    ink: "bg-ink text-cream",
  })[style] || "bg-agold-500 text-white";

// Resize to max 1600px & re-encode JPEG so uploads stay light
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve({
          dataURI: c.toDataURL("image/jpeg", 0.85),
          name: file.name || "photo.jpg",
        });
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
