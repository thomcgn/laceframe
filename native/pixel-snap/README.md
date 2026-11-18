# Local raster library

Source: [Hugo-Dz/spritefusion-pixel-snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/tree/02f9315d73d3219274d17767b36d9a231a6b1f4b), commit `02f9315d73d3219274d17767b36d9a231a6b1f4b`. MIT, Copyright (c) 2025 Hugo Duprez. Full permission/warranty notice in LICENSE; distributed Electron resources also contain `SpriteFusion-Pixel-Snapper-MIT.txt`.

## Deliberate refactoring

The upstream `process_image_common` always calls `quantize_image`, then computes profiles, estimates spacing, walks/stabilizes cuts and `resample`s one output pixel per cell. Its `process_image` WASM wrapper uses the same path; the default palette count is 16. Its RGBA quantizer preserves alpha per pixel, but dominant-cell resampling changes coordinates, dimensions and alpha distribution. It cannot be used unchanged for Laceframe's native-size portraits.

This crate extracts/refactors the actual Rust code, rather than replacing it with an unrelated TypeScript raster detector:

- `grid.rs`: upstream grayscale gradient profiles, peak-spacing estimate, elastic walker, cross-axis stabilization and cut sanitation; a borrowed RGBA view replaces the image codec. Plateau detection and comparable-peak preference avoid a one-pixel boundary shift and overreaction to isolated detail when quantization is absent. No quantized analysis image.
- `lib.rs::clean`: adapts upstream `resample`'s histogram/deterministic dominant-color selection to the **existing native coordinates**. There is no smaller intermediate image, resize, upscaling, crop or palette mapping. Only close minority RGBs in strongly dominated cells with neighboring support may change. All alpha, partial-alpha RGB, zero-alpha RGB and protected pixels stay exact. Contrasting details and ambiguous cells stay unchanged. This conservative restriction is intentionally less aggressive than upstream whole-cell flattening.
- `palette.rs`: upstream nearest-palette-color function and independent explicit palette mapping. Rust and WASM APIs expose this separately; `clean`/`clean_rgba` have no palette argument or quantization call. Laceframe's Pixel Snap UI **never calls it**. Automatic K-means reduction and upstream CLI/PNG/JPEG codecs are not bundled. Existing regional Lab color correction remains a separate step.
- `analyze` returns uncertainty if both axes do not support a similar 2–32 pixel spacing. Upstream's fallback-to-64-segments is not reported as a measured grid.

Pure Rust, no crate dependencies, no randomization, file access, network, model or host imports. Raw owned-buffer WASM ABI is wrapped internally in `pixel-snap-runtime.ts`; no pointer API enters preload. Exported memory is capped at 128 MiB; inputs at 4,194,304 pixels. Main and worker instantiate the same committed module, and Main verifies preview pixel SHA and recomputes before storing.

## Build and tests

Install Rust **1.85.1**, minimal profile, with the `wasm32-unknown-unknown` target. This is a developer build tool only, not an end-user dependency. From repository root:

```sh
node scripts/build-pixel-snap.cjs
cargo +1.85.1 test --manifest-path native/pixel-snap/Cargo.toml --locked
npx vitest run tests/pixel-snap.test.ts
```

The build uses the pinned toolchain/lockfile and `--max-memory=134217728`. It emits the exact module as base64 in `src/shared/pixel-snap-wasm.ts`, including its SHA-256. Normal Electron builds consume that committed module offline; no Rust installation/download at app startup. Source changes require explicitly rebuilding it. Raster and palette separation, source immutability and native dimensions are executable Rust/WASM tests, not just documentation.

This is a 2D heuristic. It cannot identify eyes/identity semantically or guarantee all mixed-scale art can be repaired. Review at native and magnified zoom; use protection masks, gentler settings or skip the step. Palette identity and semantic regions are not inferred. Half-transparent edge repair and visualization of every adaptive grid cut are not implemented.
