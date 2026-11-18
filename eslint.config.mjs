import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: ["node_modules/**", "native/**/target/**", "out/**", ".vite/**", "artifacts/**", "src/shared/spritefusion-generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
    languageOptions: {
      globals: {
        require: "readonly",
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        Buffer: "readonly",
        window: "readonly",
        document: "readonly",
        DataTransfer: "readonly",
        File: "readonly",
        DragEvent: "readonly",
      },
    },
  },
);
