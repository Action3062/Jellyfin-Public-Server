#!/usr/bin/env node
/**
 * Downloads the Higgsfield-generated cinematic artwork into web/public/assets
 * and converts it to compact WebP files. Runs at build/deploy time so the
 * repository never carries large binaries. Fails soft: the UI keeps its CSS
 * gradient fallbacks when an asset is missing, so a blocked network only
 * costs the imagery, never the build.
 *
 * Usage: node web/scripts/fetch-assets.mjs
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "assets");

// Generated with Higgsfield Cinema Studio Image 2.5 (2K, no people/text/logos).
const assets = [
  {
    file: "hero-cinema.webp",
    width: 1920,
    url: "https://d8j0ntlcm91z4.cloudfront.net/user_3F3LFlN5n2dps0tYolJTLIxOfcP/hf_20260710_160609_0c5aa18d-a757-4f54-bbea-0a9b96a234be.png"
  },
  {
    file: "hero-cinema-alt.webp",
    width: 1920,
    url: "https://d8j0ntlcm91z4.cloudfront.net/user_3F3LFlN5n2dps0tYolJTLIxOfcP/hf_20260710_160609_7e983e5c-b13f-4aaf-bfd6-7fac67aaf56e.png"
  },
  {
    file: "archive.webp",
    width: 1600,
    url: "https://d8j0ntlcm91z4.cloudfront.net/user_3F3LFlN5n2dps0tYolJTLIxOfcP/hf_20260710_160612_5cfb96a1-31e8-4e87-b3bd-a46fb0ea2df9.png"
  },
  {
    file: "ambient.webp",
    width: 1920,
    url: "https://d8j0ntlcm91z4.cloudfront.net/user_3F3LFlN5n2dps0tYolJTLIxOfcP/hf_20260710_160614_45ddb0d1-3d1d-49b4-b8c3-1950820390f5.png"
  }
];

async function exists(path) {
  return access(path).then(() => true, () => false);
}

async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

const sharp = await loadSharp();
await mkdir(outDir, { recursive: true });

let failures = 0;
for (const asset of assets) {
  const target = join(outDir, asset.file);
  if (await exists(target)) {
    console.log(`✓ ${asset.file} already present`);
    continue;
  }
  try {
    const res = await fetch(asset.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const source = Buffer.from(await res.arrayBuffer());
    if (sharp) {
      const webp = await sharp(source).resize({ width: asset.width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      await writeFile(target, webp);
      console.log(`✓ ${asset.file} (${(webp.length / 1024).toFixed(0)} KiB)`);
    } else {
      const fallback = target.replace(/\.webp$/, ".png");
      await writeFile(fallback, source);
      console.log(`✓ ${asset.file.replace(/\.webp$/, ".png")} saved unoptimized (install sharp for WebP conversion)`);
    }
  } catch (error) {
    failures += 1;
    console.warn(`✗ ${asset.file}: ${error instanceof Error ? error.message : error} — UI falls back to gradients`);
  }
}

if (failures) {
  console.warn(`${failures}/${assets.length} assets could not be fetched. Re-run this script from a network that can reach the CDN.`);
}
