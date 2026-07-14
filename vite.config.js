import { defineConfig } from "vite";
import { cpSync } from "fs";

export default defineConfig({
  base: "./",
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1000,
  },
  plugins: [
    {
      name: "copy-glb-assets",
      apply: "build",
      closeBundle() {
        for (const f of ["f-22.glb", "mig-35.glb", "missile.glb", "terrain.glb"]) {
          try {
            cpSync(f, `dist/${f}`);
          } catch {
            // file may not exist; skip
          }
        }
      },
    },
  ],
});
