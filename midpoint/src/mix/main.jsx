import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import MixApp from "./MixApp.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MixApp />
  </StrictMode>
);
