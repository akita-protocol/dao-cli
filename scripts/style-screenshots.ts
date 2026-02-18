import sharp from "sharp";
import { readdirSync } from "fs";
import { join } from "path";

const IMAGES_DIR = join(import.meta.dir, "../images");
const BORDER_RADIUS = 28;
const PADDING = 100;

async function styleScreenshot(inputPath: string, outputPath: string) {
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  const canvasWidth = width + PADDING * 2;
  const canvasHeight = height + PADDING * 2;

  // SVG gradient background with Akita brand colors
  const gradient = Buffer.from(`
    <svg width="${canvasWidth}" height="${canvasHeight}">
      <defs>
        <radialGradient id="glow1" cx="15%" cy="20%" r="60%">
          <stop offset="0%" stop-color="#9439e6" stop-opacity="0.4" />
          <stop offset="100%" stop-color="#9439e6" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="glow2" cx="85%" cy="80%" r="60%">
          <stop offset="0%" stop-color="#00F0FF" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#00F0FF" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="glow3" cx="80%" cy="15%" r="45%">
          <stop offset="0%" stop-color="#f35ff2" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#f35ff2" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="${canvasWidth}" height="${canvasHeight}" fill="#0a0a14" />
      <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#glow1)" />
      <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#glow2)" />
      <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#glow3)" />
    </svg>
  `);

  // SVG mask for rounded corners
  const roundedMask = Buffer.from(`
    <svg width="${width}" height="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${BORDER_RADIUS}" ry="${BORDER_RADIUS}" fill="white" />
    </svg>
  `);

  // Apply rounded corners to the screenshot
  const roundedImage = await sharp(inputPath)
    .composite([{ input: roundedMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Composite rounded screenshot onto gradient background
  await sharp(gradient)
    .resize(canvasWidth, canvasHeight)
    .composite([
      {
        input: roundedImage,
        top: PADDING,
        left: PADDING,
      },
    ])
    .png()
    .toFile(outputPath);

  console.log(`  ${outputPath}`);
}

const files = readdirSync(IMAGES_DIR).filter((f) => f.endsWith(".png") && !f.endsWith("_styled.png"));

console.log(`Styling ${files.length} screenshots...\n`);

for (const file of files) {
  const input = join(IMAGES_DIR, file);
  const output = join(IMAGES_DIR, file.replace(".png", "_styled.png"));
  await styleScreenshot(input, output);
}

console.log("\nDone!");
