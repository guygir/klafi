const CHROME_ASSETS = Object.freeze([
  "pack-wrapper-transparent.png",
  "pack-rip-seedance-v01.mp4",
  "hero-art-kalpi.png",
  "hero-art-knesset.png",
]);

export function liveDeployAssetNames({ catalog, avatars } = {}) {
  return [...new Set([
    ...CHROME_ASSETS,
    ...(catalog?.cards || []).map((card) => card.artKey).filter(Boolean),
    ...(avatars?.avatars || []).map((avatar) => avatar.art).filter(Boolean),
  ])].sort();
}
