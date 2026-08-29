import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { globalIgnores } from "eslint/config";

const baseDirectory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // App desktop (Electron/Node, CommonJS) — fora do escopo do lint do Next
    "main.js",
    "preload.js",
    "src/**",
    "scripts/**",
    "Scripts/**",
    ".ita-agent/**",
    // UI clássica servida como estático (JS de navegador, sem build)
    "public/ui/**",
    // Utilitários locais fora do app Next
    "ita-agent-ui.js",
    "ita-ai.js",
    "validate-agent.js",
    "validate-project.js",
    "validate-ui.js"
  ])
];

export default config;
