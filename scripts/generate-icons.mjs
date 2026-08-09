import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');
const logoPath = resolve(publicDir, 'LastNoteSoldLogo.png');

const BG = '#030712'; // bg-gray-950
const SIZES = [16, 32, 180, 192, 512];
const PADDING_PCT = 0.09; // 9% padding around logo

async function main() {
  // Get logo metadata
  const meta = await sharp(logoPath).metadata();
  console.log(`Logo: ${meta.width}x${meta.height} ${meta.format}`);

  const logoW = meta.width;
  const logoH = meta.height;
  const aspectRatio = logoW / logoH;

  for (const size of SIZES) {
    const padPx = Math.round(size * PADDING_PCT);
    const availSize = size - 2 * padPx; // available space after padding

    // fit=contain: scale logo to fit within availSize square, maintaining aspect ratio
    let logoRenderW, logoRenderH;
    if (aspectRatio > 1) {
      // wider than tall: width constrains
      logoRenderW = availSize;
      logoRenderH = Math.round(availSize / aspectRatio);
    } else {
      // taller than wide: height constrains
      logoRenderH = availSize;
      logoRenderW = Math.round(availSize * aspectRatio);
    }

    // Center the logo in the square canvas
    const left = padPx + Math.round((availSize - logoRenderW) / 2);
    const top = padPx + Math.round((availSize - logoRenderH) / 2);

    const resizedLogo = await sharp(logoPath)
      .resize(logoRenderW, logoRenderH, { fit: 'contain' })
      .toBuffer();

    const outPath = resolve(publicDir, `favicon-${size}.png`);

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 3, // RGB only — no alpha channel
        background: BG,
      },
    })
      .composite([{ input: resizedLogo, left, top }])
      .removeAlpha()
      .png()
      .toFile(outPath);

    console.log(`  favicon-${size}.png: ${size}x${size}, logo ${logoRenderW}x${logoRenderH} at (${left},${top})`);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
