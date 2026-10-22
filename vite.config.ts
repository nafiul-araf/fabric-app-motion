import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    // framer-motion + React make one ~560 kB bundle; fine for a demo.
    build: { chunkSizeWarningLimit: 700 },
    resolve: {
        alias: { "@": resolve(import.meta.dirname, "src") },
    },
});
