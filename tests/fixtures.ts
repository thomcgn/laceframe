import { PNG } from "pngjs";
import { deflateSync } from "node:zlib";
// Synthetic PNG generated in memory: no user portraits or binary fixtures in git.
export function png(width = 2, height = 3, shade = 100): Buffer {
  const crc = (bytes: Buffer) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++)
        value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, bytes: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), bytes]);
    const length = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    checksum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(height * (width * 4 + 1), shade);
  for (let y = 0; y < height; y++) {
    pixels[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++)
      pixels[y * (width * 4 + 1) + x * 4 + 4] = 255;
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function transparentPng(width = 41, height = 53, shade = 100) {
  const p = PNG.sync.read(png(width, height, shade));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (!x || !y || x === width - 1 || y === height - 1)
        p.data[(y * width + x) * 4 + 3] = 0;
  return PNG.sync.write(p);
}
export function masterReview(sha256: string) {
  return {
    sourceSha256: sha256,
    identityConfirmed: true as const,
    silhouetteConfirmed: true as const,
    activationConfirmed: true as const,
    notes: "Synthetic manual identity and silhouette review",
  };
}
