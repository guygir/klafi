#!/usr/bin/env node

import { copyFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "../..");
const sourceDir = process.env.KALPI_GENERATED_ASSETS_DIR
  ?? path.join(os.homedir(), ".cursor/projects/Users-guygirmonsky-Cursor-Elections/assets");
const outputDir = path.join(projectRoot, "docs/design/assets");

const files = [
  "hero-art-knesset.png",
  "hero-art-broad-government.png",
  "hero-art-state-inquiry.png",
  "hero-art-naama-lazimi.png",
  "hero-art-yair-golan.png",
  "hero-art-benjamin-netanyahu-01.png",
  "hero-art-benjamin-netanyahu-02.png",
  "hero-art-benjamin-netanyahu-03.png",
  "hero-art-gadi-eisenkot-slot1.png",
  "hero-art-naftali-bennett-slot1.png",
  "hero-art-avigdor-lieberman-slot1.png",
  "hero-art-yair-golan-slot1.png",
  "hero-art-bezalel-smotrich-slot1.png",
  "hero-art-itamar-ben-gvir-slot1.png",
  "hero-art-aryeh-deri-slot1.png",
  "hero-art-yaakov-asher-slot1.png",
  "hero-art-yousef-jabareen-slot1.png",
  "hero-art-mansour-abbas-slot1.png",
  "hero-art-ofer-winter-slot1.png",
  "hero-art-yoaz-hendel-slot1.png",
  "hero-art-benny-gantz-slot1.png",
  "hero-art-miri-regev-01.jpg",
  "pack-rip-seedance-v01.mp4",
];

await mkdir(outputDir, { recursive: true });
for (const filename of files) {
  await copyFile(path.join(sourceDir, filename), path.join(outputDir, filename));
}

console.log(`Synced ${files.length} generated PoC assets → ${outputDir}`);
