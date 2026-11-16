import { randomBytes } from "node:crypto";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => {
  // React Refresh injects a development preamble. Authorize only Vite's nonce,
  // rather than weakening the packaged application's script policy.
  const nonce =
    command === "serve" ? randomBytes(18).toString("base64") : undefined;
  return {
    base: "./",
    html: nonce ? { cspNonce: nonce } : undefined,
    plugins: [
      react(),
      {
        name: "laceframe-development-csp",
        apply: "serve",
        transformIndexHtml(html) {
          return html.replace(
            "script-src 'self'",
            `script-src 'self' 'nonce-${nonce}'`,
          );
        },
      },
    ],
  };
});
