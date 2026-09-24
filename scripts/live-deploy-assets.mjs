const CHROME_ASSETS = Object.freeze([
  "pack-wrapper-klafi.png",
  "hero-art-kalpi.png",
  "hero-art-knesset.png",
  "ballot-letter-ysr.png",
  "ballot-letter-lik.png",
  "ballot-letter-byd.png",
  "ballot-letter-yb.png",
  "ballot-letter-dem.png",
  "ballot-letter-rz.png",
  "ballot-letter-otz.png",
  "ballot-letter-shs.png",
  "ballot-letter-utj.png",
  "ballot-letter-jnt.png",
  "ballot-letter-ram.png",
  "ballot-letter-amh.png",
  "ballot-letter-bw.png",
  "ballot-paper.png",
]);

export function liveDeployAssetNames({ catalog, avatars } = {}) {
  return [...new Set([
    ...CHROME_ASSETS,
    ...(catalog?.cards || []).map((card) => card.artKey).filter(Boolean),
    ...(avatars?.avatars || []).map((avatar) => avatar.art).filter(Boolean),
  ])].sort();
}
