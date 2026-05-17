import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `vite build`             → web build for GitHub Pages (served under /MidpointApp/)
// `vite build --mode native` → Capacitor build (served from app bundle root)
export default defineConfig(({ mode }) => ({
  base: mode === "native" ? "/" : "/MidpointApp/",
  plugins: [react()],
}));
