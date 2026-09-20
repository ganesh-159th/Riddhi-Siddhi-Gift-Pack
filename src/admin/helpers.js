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

// ISO timestamp (from a saved product) -> value for an <input type="datetime-local">,
// i.e. wall-clock time in the browser's zone. Empty/na values become "".
export function toDateTimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const badgeClass = (style) =>
  ({
    gold: "bg-agold-500 text-white",
    wine: "bg-wine-500 text-cream",
    ink: "bg-ink text-cream",
  })[style] || "bg-agold-500 text-white";

// Data-URI -> Blob so photos can be uploaded straight to S3 via presigned URL.
export function dataUriToBlob(dataURI) {
  const [head, base64] = String(dataURI).split(",");
  const mime = /^data:([^;]+)/.exec(head || "");
  const bytes = atob(base64 || "");
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: (mime && mime[1]) || "image/jpeg" });
}

// Resize to max 1600px & re-encode JPEG so uploads stay light. Also returns the
// image dimensions and compressed byte size so they can be recorded in products.
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
        const dataURI = c.toDataURL("image/jpeg", 0.85);
        const size = new Blob([dataUriToBlob(dataURI)]).size;
        resolve({
          dataURI,
          name: file.name || "photo.jpg",
          width: c.width,
          height: c.height,
          size,
        });
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
