import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    "name": "health-leveling",
    "compatibilityDate": "2026-11-10",
    "observability": {
      "enabled": true
    },
    "entrypoint": "@tanstack/react-start/server-entry"
  }
});
