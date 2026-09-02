import React from "react";
import ReactDOM from "react-dom/client";
import SiteApp from "./components/SiteApp.jsx";
import "./index.css";
import "./site.css";

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
    splash.style.transition = "opacity .3s ease";
    splash.style.opacity = "0";
    setTimeout(() => splash.remove(), 350);
  }
});
