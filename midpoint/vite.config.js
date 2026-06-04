import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `vite build`             → web build for GitHub Pages (served under /MidpointApp/)
// `vite build --mode native` → Capacitor build (served from app bundle root)
export default defineConfig(({ mode }) => ({
  base: mode === "native" ? "/" : "/MidpointApp/",
  plugins: [react()],
  build: {
    rollupOptions: {
      // Two independent pages, two URLs:
      //   index.html → the midpoint game (untouched)
      //   mix.html   → tincture, the colour-mixing game
      input: {
        main: "index.html",
        mix: "mix.html",
      },
    },
  },
}));
