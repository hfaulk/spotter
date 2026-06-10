// Generates the PWA icon PNGs from public/icons/icon.svg
// Run once from the repo root:  node scripts/generate-icons.js
// Uses sharp, which is already a dependency.

import sharp from "sharp";

for (const size of [192, 512]) {
  await sharp("public/icons/icon.svg")
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon-${size}.png`);
  console.log(`✓ public/icons/icon-${size}.png`);
}