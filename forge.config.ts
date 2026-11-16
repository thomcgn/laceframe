import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { MakerZIP } from "@electron-forge/maker-zip";

const config: ForgeConfig = {
  packagerConfig: { asar: true, executableName: "laceframe" },
  makers: [new MakerZIP({}, ["linux", "darwin", "win32"])],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/main.ts",
          config: "vite.main.config.mts",
          target: "main",
        },
        {
          entry: "src/preload/preload.ts",
          config: "vite.preload.config.mts",
          target: "preload",
        },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.mts" }],
    }),
  ],
};
export default config;
