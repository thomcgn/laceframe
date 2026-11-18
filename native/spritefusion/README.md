# Sprite Fusion original engine

Source: [Hugo-Dz/spritefusion-pixel-snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/tree/02f9315d73d3219274d17767b36d9a231a6b1f4b), commit `02f9315d73d3219274d17767b36d9a231a6b1f4b`, MIT (Hugo Duprez, 2025). `vendor/src/lib.rs`, `src/main.rs`, Cargo manifest/lock and LICENSE are unchanged upstream files. `UPSTREAM.json` records their hashes; the build rejects modified vendored inputs. Cargo resolution for the transport crate is committed separately. Original MIT and dependency notices ship in Electron resources.

## Actual integration

`src/lib.rs` includes the hash-verified, unchanged upstream source in a private Rust module. It calls the actual `process_image` for historical recipes and exposes `quantize_rgba` as a separate bounded entry to the same original seeded K-means / custom-palette functions. The private bridge is in the adapter; no algorithm is copied into TypeScript or modified in vendor. PNG→RGBA decoding remains bounded. It does not replace or modify detection, seeded K-means, cut stabilization, resampling, palette mapping or PNG encoding. The generated module also exports upstream `process_image` itself. Rust 1.85.1, wasm-bindgen-cli 0.2.105. The committed generated JS/types/WASM-base64 under `src/shared/spritefusion-generated` are consumed offline by Vite/Main and the renderer worker, using synchronous byte initialization. No fetch, CDN, runtime Rust/compiler installation, host filesystem or model. WASM imports only generated string/error/externref glue. The unused generated async loader is not called.

Explicit developer rebuild (requires the named toolchain/wasm target and wasm-bindgen CLI):

```sh
node scripts/build-spritefusion.cjs
```

The normal `npm run build` needs neither Rust nor network access for this module. Cargo uses `--locked`; toolchain, original commit and generated WASM SHA are recorded. Maximum WASM linear memory is 512 MiB; admission bounds are 4,194,304 pixels and 67,108,864 input pixels × requested colors. Output has the original engine's actual dimensions, not an imposed 64×64 size. A trap fails the job; a trapped Main runtime requires app restart. Renderer cancel/discard terminates the worker. Bounded Main recomputation/PNG verification may briefly block; this is not a whole-application RAM or latency guarantee.

## Historical original-engine integration (recipes retained)

| Before | Current behavior |
| --- | --- |
| `analyzeSnap` / extracted Rust profiles and TS neighbor counts | Legacy functions remain testable, but are absent from the new UI. Original `process_image` detects its own grid, has internal fallback and does not export confidence/cut diagnostics. No independent analysis button claims those outputs. |
| Refactored `snapPixels`, native-size selective cleanup | Active UI calls the complete original WASM path. Old module, settings and `spritefusion-native-rgba-v1` remain for historical recipe reproduction/compatibility. |
| Shared zoom/pan | Original and decoded output have independent `PixelViewport` local cameras and actual canvas dimensions. |
| Regional Lab correction and masks | Existing separate color tool remains. Whole-image original snapping is disabled for every nonzero explicit/inherited protection mask; no geometric mask transfer or naive source-pixel copy. |
| Preview / persistence | Computed original PNG stays temporarily in memory; no intermediate file or project mutation. Discard releases the draft/worker. Adopt recomputes in Main, verifies pixel SHA, stores exact engine PNG bytes and a versioned source-bound candidate. Human approval remains separate. |

The historical original-engine record version is `spritefusion-original-wasm-v1`. Masks refer to **source dimensions**, outputs to their new dimensions. First new-version write makes a byte-exact `laceframe.v2.pre-spritefusion.backup.json`, unless an earlier pending migration already owns backup priority. Old projects open without writes. Older strict binaries need the original backup and full asset tree.

## Upstream limitations kept honestly

Original `process_image` always quantizes before grid detection/resampling, even with a custom palette; the requested color count controls that initial K-means stage. It does not expose a quantization-free raster operation. Laceframe's separate regional color correction is not replaced by this whole-image quantization. A palette count is an upper bound on visible RGB groups, not a promise every requested color occurs.

Resampling selects a dominant RGBA value per adaptive cell. It can change aspect ratio, edge alpha distribution, detail and character appearance. Transparent inputs/output and actual dimensions are tested, but per-source-pixel alpha preservation, exact silhouette registration, grid uniformity in source coordinates, idempotence on already clean art and semantic identity fidelity are **not** guaranteed by upstream or this integration. Preview and explicit human review decide acceptability; originals never change. Fully transparent outputs cannot be approved as usable characters. Unsupported protected jobs are blocked rather than silently dropping masks.

Reference conformance: build the unmodified upstream CLI with its lockfile, then set `SPRITEFUSION_REFERENCE_CLI=<binary>` when running `npx vitest run tests/spritefusion.test.ts`. Compare actual PNG bytes, not visual scores. Default offline tests use checked-in hashes/dimensions of that native reference for synthetic fixtures. `SPRITEFUSION_RECORD=1` explicitly records only synthetic native baselines. Optional `SPRITEFUSION_PORTRAIT=<authorized PNG>` plus `SPRITEFUSION_TEST_OUTPUT=<temporary directory>` checks a local portrait read-only; its images never enter Git. No live image generation is needed.

## Exact-resolution raster pipeline

The active editor now uses `laceframe-raster-spritefusion-v1`: a separate tested uniform-cell sampler selects an existing RGBA value (cell majority, center wins ties; or nearest cell center) at explicit width/height and fractional-cell offsets, then optionally calls the original independent WASM quantizer. This is an explicit extension because upstream `process_image` cannot guarantee exact target dimensions or skip its coupled quantization. It is not presented as the original adaptive resampler. Original vendor hashes and historical original-engine PNG conformance remain unchanged.

Original colors bypass quantization. Custom palettes must fit the chosen color limit. No interpolation or dithering. Alpha is selected without matte blending; the editor explicitly defaults to hard alpha (threshold 128) and offers preservation of the selected alpha values. That selection is not preservation of every source pixel or guaranteed silhouette fidelity. A synchronized presentation uses original-image coordinates to compare equal framing even at different resolutions; 1:1 refers to output pixels. Export recomputes the same recipe in Main and checks raw RGBA SHA before encoding a separate PNG candidate. New-version writes create a pre-raster-target backup; old recipes remain readable and reproducible. Nonzero protection masks block geometry changes. No automatic identity approval, semantic segmentation or confidence export.
