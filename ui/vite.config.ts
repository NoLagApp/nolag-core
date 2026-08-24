import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  build: {
    // Everything is served from one nginx container with no CDN, so a single
    // bundle beats many small requests here.
    chunkSizeWarningLimit: 800,
  },
});
