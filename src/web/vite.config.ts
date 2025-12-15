import { defineConfig, loadEnv } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";
import process from "node:process";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd() + "/../..", "");
  return {
    plugins: [fresh(), tailwindcss()],
    server: {
      port: parseInt(env.PORT_DASHBOARD || "8081"),
      allowedHosts: ["pml.casys.ai", "localhost"],
    },
    build: {
      sourcemap: false, // Suppress sourcemap warnings
    },
  };
});
