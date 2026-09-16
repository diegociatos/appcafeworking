import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Variável colada com BOM/espaço (ex.: secret do Cloudflare gravado pelo
// PowerShell) quebra o cabeçalho apikey e o login falha como "sem conexão".
// Limpa antes de o Vite ler o ambiente, que tem prioridade sobre .env.production.
for (const k of Object.keys(process.env)) {
  if (k.startsWith("VITE_")) process.env[k] = process.env[k].replace(/^﻿/, "").trim();
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true },
  build: {
    // Separa bibliotecas (React, ícones) do código do app: o vendor muda pouco
    // e fica cacheado entre deploys → menos banda baixada a cada atualização.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          icons: ["lucide-react"],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
});
