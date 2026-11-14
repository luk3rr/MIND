/*
 * Filename: main.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/app.css";
import { applyTheme, readTheme } from "./theme.js";

// Apply the saved theme before the first paint to avoid a flash of the wrong one.
applyTheme(readTheme());

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
