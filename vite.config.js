import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes the built asset paths relative, so the dist/ folder works
// whether it's served from a domain root (Netlify/Vercel) or a sub-path
// (GitHub Pages project sites) without further config.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
