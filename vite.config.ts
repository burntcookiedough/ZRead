import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => {
  return {
    clearScreen: false,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : (process.env.DISABLE_HMR === 'true' ? false : undefined),
      watch: process.env.DISABLE_HMR === 'true'
        ? null
        : {
            ignored: ["**/src-tauri/**"],
          },
    },
    envPrefix: ["VITE_", "TAURI_ENV_*"],
    build: {
      target:
        process.env.TAURI_ENV_PLATFORM === "windows"
          ? "chrome105"
          : "safari13",
      minify: !process.env.TAURI_ENV_DEBUG ? ("esbuild" as const) : false,
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
    },
  };
});
