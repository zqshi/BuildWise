import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Catch unhandled promise rejections — always log so browser dev tools can capture
window.addEventListener("unhandledrejection", (event) => {
  console.error("[buildwise] unhandled rejection:", event.reason);
});

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container not found");
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
