import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("apps/web/public/assets/tinkercad");

const assets = [
  ["fonts/ArtifaktElementRegular.woff2", "https://www.tinkercad.com/assets_fe_bdb835d683a6fd07ed42a8df69bf57cf8bfb3cf1/js/tinkercad-frontend/browser/media/ArtifaktElementRegular.woff2"],
  ["fonts/ArtifaktElementBold.woff2", "https://www.tinkercad.com/assets_fe_bdb835d683a6fd07ed42a8df69bf57cf8bfb3cf1/js/tinkercad-frontend/browser/media/ArtifaktElementBold.woff2"],
  ["fonts/ArtifaktLegendRegular.woff2", "https://www.tinkercad.com/assets_fe_bdb835d683a6fd07ed42a8df69bf57cf8bfb3cf1/js/tinkercad-frontend/browser/media/ArtifaktLegendRegular.woff2"],
  ["fonts/ArtifaktLegendBold.woff2", "https://www.tinkercad.com/assets_fe_bdb835d683a6fd07ed42a8df69bf57cf8bfb3cf1/js/tinkercad-frontend/browser/media/ArtifaktLegendBold.woff2"],
  ["tinkercad-lockup-white.svg", "https://static.tinkercad.com/images/tinkercad-lockup-white.svg"],
  ["hero-home-poster-airplane_w1800.jpg", "https://static.tinkercad.com/marketing/home/hero-home-poster-airplane_w1800.jpg"],
  ["hero-homepage-2000.mp4", "https://static.tinkercad.com/marketing/home/hero-homepage-2000.mp4"],
  ["feature-video-poster_w600.jpg", "https://static.tinkercad.com/marketing/home/feature-video-poster_w600.jpg"],
  ["home-3d-poster_w600.jpg", "https://static.tinkercad.com/marketing/home/home-3d-poster_w600.jpg"],
  ["home-3d.mp4", "https://static.tinkercad.com/marketing/home/home-3d.mp4"],
  ["design-poster_w600.jpg", "https://static.tinkercad.com/marketing/circuits/design-poster_w600.jpg"],
  ["design-600.mp4", "https://static.tinkercad.com/marketing/circuits/design-600.mp4"],
  ["dragdrop-poster_w600.jpg", "https://static.tinkercad.com/marketing/codeblocks/dragdrop-poster_w600.jpg"],
  ["dragdrop.mp4", "https://static.tinkercad.com/marketing/codeblocks/dragdrop.mp4"],
  ["educational-standards_w600.jpg", "https://static.tinkercad.com/marketing/home/educational-standards_w600.jpg"],
  ["ngss_w450.png", "https://static.tinkercad.com/marketing/home/ngss_w450.png"],
  ["common-core_w450.png", "https://static.tinkercad.com/marketing/home/common-core_w450.png"],
  ["3dprinting_w600.jpg", "https://static.tinkercad.com/marketing/home/3dprinting_w600.jpg"],
  ["arch_w600.jpg", "https://static.tinkercad.com/marketing/home/arch_w600.jpg"],
  ["3d-card_w600.jpg", "https://static.tinkercad.com/marketing/home/3d-card_w600.jpg"],
  ["robotics_w600.jpg", "https://static.tinkercad.com/marketing/home/robotics_w600.jpg"],
  ["banner_million.svg", "https://static.tinkercad.com/marketing/home/banner_million.svg"],
  ["banner_innovators.svg", "https://static.tinkercad.com/nav/banner_innovators.svg"],
  ["chrome-store.svg", "https://static.tinkercad.com/nav/store/en.svg"],
  ["favicon.ico", "https://www.tinkercad.com/favicon.ico"],
];

async function download([name, url]) {
  const destination = path.join(output, name);
  await mkdir(path.dirname(destination), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  return name;
}

await mkdir(output, { recursive: true });
const queue = [...assets];
const completed = [];
const failures = [];

async function worker() {
  while (queue.length) {
    const asset = queue.shift();
    try {
      completed.push(await download(asset));
    } catch (error) {
      failures.push({ name: asset[0], error: String(error) });
    }
  }
}

await Promise.all(Array.from({ length: 4 }, worker));
console.log(JSON.stringify({ downloaded: completed.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
