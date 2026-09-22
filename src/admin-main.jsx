import React from "react";
import ReactDOM from "react-dom/client";
import AdminApp from "./admin/AdminApp.jsx";
import "./index.css";
// site.css carries the shared product-card layout (.product-grid, .product-card,
// .card-body, .card-actions, ...) so the Preview mode renders cards pixel-identical
// to the live site. Imported BEFORE admin.css so the admin's light theme still wins.
import "./site.css";
import "./admin.css";

ReactDOM.createRoot(document.getElementById("admin-root")).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>
);
