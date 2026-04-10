/**
 * Generates all Tauri app icons from an SVG source.
 *
 * Design: A bold, bright 4-pointed star with cosmic glow on a deep-space
 * gradient background — purple/indigo tones matching the Starfield brand.
 */

import sharp from "sharp";
import pngToIco from "png-to-ico";
import fs from "node:fs/promises";
import path from "node:path";

const ICON_DIR = path.resolve("src-tauri", "icons");

// ── SVG source ──────────────────────────────────────────────────────────────

function buildSvg(size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42; // star outer reach
  const ri = size * 0.13; // star inner pinch
  const glow = size * 0.3; // glow radius
  const cornerRadius = size * 0.18;

  // 4-pointed star polygon
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 - Math.PI / 2;
    const midAngle = angle + Math.PI / 4;
    pts.push(
      `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`,
      `${cx + ri * Math.cos(midAngle)},${cy + ri * Math.sin(midAngle)}`,
    );
  }
  const starPoints = pts.join(" ");

  // Small accent dots (orbiting particles)
  const dots = [
    { angle: 0.6, dist: 0.36, r: size * 0.015, opacity: 0.8 },
    { angle: 2.1, dist: 0.4, r: size * 0.012, opacity: 0.6 },
    { angle: 3.8, dist: 0.33, r: size * 0.01, opacity: 0.5 },
    { angle: 5.2, dist: 0.38, r: size * 0.008, opacity: 0.4 },
  ];

  const dotsSvg = dots
    .map((d) => {
      const dx = cx + size * d.dist * Math.cos(d.angle);
      const dy = cy + size * d.dist * Math.sin(d.angle);
      return `<circle cx="${dx}" cy="${dy}" r="${d.r}" fill="white" opacity="${d.opacity}"/>`;
    })
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <!-- Background gradient: vivid purple, not near-black -->
    <radialGradient id="bg" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#5b21b6"/>
      <stop offset="55%" stop-color="#3b0764"/>
      <stop offset="100%" stop-color="#200840"/>
    </radialGradient>

    <!-- Star fill gradient: bright white core fading to lavender -->
    <linearGradient id="starGrad" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#f5f3ff"/>
      <stop offset="45%" stop-color="#ddd6fe"/>
      <stop offset="100%" stop-color="#a78bfa"/>
    </linearGradient>

    <!-- Outer glow: more intense -->
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#c4b5fd" stop-opacity="0.5"/>
      <stop offset="50%" stop-color="#7c3aed" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/>
    </radialGradient>

    <!-- Inner core glow -->
    <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="white" stop-opacity="1"/>
      <stop offset="40%" stop-color="#ede9fe" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#c4b5fd" stop-opacity="0"/>
    </radialGradient>

    <!-- Star shadow/glow filter -->
    <filter id="starGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${size * 0.025}"/>
    </filter>
  </defs>

  <!-- Rounded background -->
  <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="url(#bg)"/>

  <!-- Ambient glow behind star -->
  <circle cx="${cx}" cy="${cy}" r="${glow}" fill="url(#glow)"/>

  <!-- Star shadow layer (blurred) -->
  <polygon points="${starPoints}" fill="#a78bfa" opacity="0.5" filter="url(#starGlow)"/>

  <!-- Main star -->
  <polygon points="${starPoints}" fill="url(#starGrad)"/>

  <!-- Bright core -->
  <circle cx="${cx}" cy="${cy}" r="${size * 0.06}" fill="url(#coreGlow)"/>

  <!-- Accent ring -->
  <circle cx="${cx}" cy="${cy}" r="${size * 0.22}" fill="none"
    stroke="rgba(196, 181, 253, 0.15)" stroke-width="${size * 0.003}"/>

  <!-- Particle dots -->
  ${dotsSvg}
</svg>`;
}

// ── Render helpers ──────────────────────────────────────────────────────────

/**
 * Renders the SVG at 1024 px and uses Lanczos downsampling for all output
 * sizes. This avoids the blurriness that comes from rasterising the SVG
 * directly at the target (tiny) size.
 */
async function buildMaster() {
  const svg = Buffer.from(buildSvg(1024));
  return sharp(svg).resize(1024, 1024).png().toBuffer();
}

async function renderPng(outputPath, size, master) {
  await sharp(master)
    .resize(size, size, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(outputPath);
}

async function renderIco(outputPath, sizes, master) {
  const buffers = await Promise.all(
    sizes.map((s) =>
      sharp(master)
        .resize(s, s, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer(),
    ),
  );
  const ico = await pngToIco(buffers);
  await fs.writeFile(outputPath, ico);
}

async function renderIcns(outputPath, master) {
  // macOS .icns is just a 1024-px PNG for modern Tauri builds.
  await sharp(master).resize(1024, 1024).png().toFile(outputPath);
}

// ── Main ────────────────────────────────────────────────────────────────────

const pngTargets = [
  { name: "32x32.png", size: 32 },
  { name: "64x64.png", size: 64 },
  { name: "128x128.png", size: 128 },
  { name: "128x128@2x.png", size: 256 },
  { name: "icon.png", size: 512 },
  // Windows Store logos
  { name: "Square30x30Logo.png", size: 30 },
  { name: "Square44x44Logo.png", size: 44 },
  { name: "Square71x71Logo.png", size: 71 },
  { name: "Square89x89Logo.png", size: 89 },
  { name: "Square107x107Logo.png", size: 107 },
  { name: "Square142x142Logo.png", size: 142 },
  { name: "Square150x150Logo.png", size: 150 },
  { name: "Square284x284Logo.png", size: 284 },
  { name: "Square310x310Logo.png", size: 310 },
  { name: "StoreLogo.png", size: 50 },
];

console.log("Generating icons…");

const master = await buildMaster();

await Promise.all(
  pngTargets.map(({ name, size }) =>
    renderPng(path.join(ICON_DIR, name), size, master),
  ),
);
console.log(`  ✓ ${pngTargets.length} PNG icons`);

await renderIco(
  path.join(ICON_DIR, "icon.ico"),
  [16, 20, 24, 32, 40, 48, 64, 96, 128, 256],
  master,
);
console.log("  ✓ icon.ico");

await renderIcns(path.join(ICON_DIR, "icon.icns"), master);
console.log("  ✓ icon.icns");

// Android icons
const androidDir = path.join(ICON_DIR, "android");
const androidTargets = [
  { dir: "mipmap-mdpi", size: 48 },
  { dir: "mipmap-hdpi", size: 72 },
  { dir: "mipmap-xhdpi", size: 96 },
  { dir: "mipmap-xxhdpi", size: 144 },
  { dir: "mipmap-xxxhdpi", size: 192 },
];
await Promise.all(
  androidTargets.map(({ dir, size }) =>
    renderPng(path.join(androidDir, dir, "ic_launcher.png"), size, master),
  ),
);
console.log(`  ✓ ${androidTargets.length} Android icons`);

// iOS icons
const iosDir = path.join(ICON_DIR, "ios");
const iosTargets = [
  { name: "AppIcon-20x20@1x.png", size: 20 },
  { name: "AppIcon-20x20@2x.png", size: 40 },
  { name: "AppIcon-20x20@2x-1.png", size: 40 },
  { name: "AppIcon-20x20@3x.png", size: 60 },
  { name: "AppIcon-29x29@1x.png", size: 29 },
  { name: "AppIcon-29x29@2x.png", size: 58 },
  { name: "AppIcon-29x29@2x-1.png", size: 58 },
  { name: "AppIcon-29x29@3x.png", size: 87 },
  { name: "AppIcon-40x40@1x.png", size: 40 },
  { name: "AppIcon-40x40@2x.png", size: 80 },
  { name: "AppIcon-40x40@2x-1.png", size: 80 },
  { name: "AppIcon-40x40@3x.png", size: 120 },
  { name: "AppIcon-60x60@2x.png", size: 120 },
  { name: "AppIcon-60x60@3x.png", size: 180 },
  { name: "AppIcon-76x76@1x.png", size: 76 },
  { name: "AppIcon-76x76@2x.png", size: 152 },
  { name: "AppIcon-83.5x83.5@2x.png", size: 167 },
  { name: "AppIcon-512@2x.png", size: 1024 },
];
await Promise.all(
  iosTargets.map(({ name, size }) =>
    renderPng(path.join(iosDir, name), size, master),
  ),
);
console.log(`  ✓ ${iosTargets.length} iOS icons`);

console.log("\nDone! All icons generated in src-tauri/icons/");
