import React from "react";
import ReactDOM from "react-dom/client";
import SiteApp from "./components/SiteApp.jsx";
import "./lib/i18n.js";
import "./index.css";
import "./site.css";

const DISPLAY_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&display=swap";

function loadDisplayFont() {
  if (document.querySelector(`link[data-display-font="${DISPLAY_FONT_HREF}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = DISPLAY_FONT_HREF;
  link.media = "print";
  link.dataset.displayFont = DISPLAY_FONT_HREF;
  link.addEventListener("load", () => {
    link.media = "all";
  });
  document.head.appendChild(link);
}

loadDisplayFont();

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <SiteApp />
  </React.StrictMode>
);

// Fade out the boot splash only once this frame has actually painted the app,
// so the phone never flashes back to a blank page.
requestAnimationFrame(() => {
  const splash = document.getElementById("boot-splash");
  if (splash) {
    splash.classList.add("boot-splash-hide");
    setTimeout(() => splash.remove(), 350);
  }
});
