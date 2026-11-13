import fs from 'fs';
import path from 'path';

console.log('🔄 [Version & Assets Sync] Starting automated version bump and icon generation...');

function compareSemver(a, b) {
  const pa = (a || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = (b || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// 1. Read package.json & android/app/build.gradle and determine highest floor version
const pkgPath = path.resolve('package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let currentVersion = pkg.version || '1.0.58';

const buildGradlePath = path.resolve('android', 'app', 'build.gradle');
let existingGradleContent = '';
if (fs.existsSync(buildGradlePath)) {
  existingGradleContent = fs.readFileSync(buildGradlePath, 'utf8');
  const vnMatch = existingGradleContent.match(/versionName\s+"([^"]+)"/);
  if (vnMatch && compareSemver(vnMatch[1], currentVersion) > 0) {
    currentVersion = vnMatch[1];
  }
}

// Query GitHub Releases API to guarantee the new version is strictly higher than any published release
try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  const ghRes = await fetch('https://api.github.com/repos/pawankabi/courier-rider-payout/releases/latest', {
    headers: { 'User-Agent': 'CourierPayout-AutoBump', Accept: 'application/vnd.github.v3+json' },
    signal: controller.signal,
  });
  clearTimeout(timer);
  if (ghRes.ok) {
    const ghData = await ghRes.json();
    const rawTag = (ghData.tag_name || ghData.name || '').replace(/^v/i, '').trim();
    if (rawTag && compareSemver(rawTag, currentVersion) > 0) {
      currentVersion = rawTag;
      console.log(`🌐 GitHub latest release discovered: v${rawTag} (ensuring next version is strictly higher)`);
    }
  }
} catch (e) {
  // Offline or timeout fallback to local floor
}

// Parse semver (e.g., 1.0.58 -> 1.0.59)
const parts = currentVersion.split('.').map((n) => parseInt(n, 10) || 0);
while (parts.length < 3) parts.push(0);
parts[2] += 1;
const nextVersion = parts.slice(0, 3).join('.');

console.log(`📌 Bumping Version: ${currentVersion} ➔ ${nextVersion}`);
pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 2. Update src/utils/version.ts
const versionTsPath = path.resolve('src', 'utils', 'version.ts');
if (fs.existsSync(versionTsPath)) {
  let vts = fs.readFileSync(versionTsPath, 'utf8');
  vts = vts.replace(/export const APP_VERSION = '[^']+';/, `export const APP_VERSION = '${nextVersion}';`);
  fs.writeFileSync(versionTsPath, vts);
  console.log(`   - Updated src/utils/version.ts to ${nextVersion}`);
}

// 3. Update android/app/build.gradle
let nextVersionCode = parts[2] || 44;
if (existingGradleContent) {
  let bg = existingGradleContent;
  const vcMatch = bg.match(/versionCode\s+(\d+)/);
  if (vcMatch) {
    nextVersionCode = parseInt(vcMatch[1], 10) + 1;
  }
  bg = bg.replace(/versionCode\s+\d+/g, `versionCode ${nextVersionCode}`);
  bg = bg.replace(/versionName\s+"[^"]+"/g, `versionName "${nextVersion}"`);
  fs.writeFileSync(buildGradlePath, bg);
  console.log(`   - Updated android/app/build.gradle (versionCode ${nextVersionCode}, versionName "${nextVersion}")`);
}

// 4. Update public/version.json & src/services/liveUpdateService.ts
const buildTime = Date.now();
const nowLocal = new Date(buildTime);
const todayDate = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
const versionJsonPath = path.resolve('public', 'version.json');
const versionInfo = {
  version: nextVersion,
  versionCode: nextVersionCode,
  buildTime,
  buildDate: todayDate,
  releaseNotes: `Auto-Sync Version ${nextVersion} - Safe Ledger, Trash Auto-Purge & Fast OTA Update`,
  updatedAt: new Date(buildTime).toISOString()
};
fs.writeFileSync(versionJsonPath, JSON.stringify(versionInfo, null, 2));
console.log(`   - Updated public/version.json`);

const liveUpdatePath = path.resolve('src', 'services', 'liveUpdateService.ts');
if (fs.existsSync(liveUpdatePath)) {
  let lus = fs.readFileSync(liveUpdatePath, 'utf8');
  lus = lus.replace(
    /export const CURRENT_LOCAL_BUILD_TIME = \d+;/,
    `export const CURRENT_LOCAL_BUILD_TIME = ${buildTime};`
  );
  fs.writeFileSync(liveUpdatePath, lus);
  console.log(`   - Updated CURRENT_LOCAL_BUILD_TIME in liveUpdateService.ts`);
}

// 5. Generate Icons for Admin and Rider (only if missing or --icons flag passed)
async function generateAllIcons() {
  const forceIcons = process.argv.includes('--icons') || process.argv.includes('--force-icons');
  const pwaExists = fs.existsSync(path.resolve('public', 'pwa-192x192.png'));
  
  if (pwaExists && !forceIcons) {
    console.log('⚡ [Icons] High-resolution mipmap and PWA icons already generated. Skipping image re-rendering.');
    return;
  }

  const adminSvg = path.resolve('public', 'admin-logo.svg');
  const riderSvg = path.resolve('public', 'rider-logo.svg');

  if (!fs.existsSync(adminSvg) || !fs.existsSync(riderSvg)) {
    console.warn('⚠️ Admin or Rider SVG file not found in /public!');
    return;
  }

  try {
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default;

    console.log('🎨 Generating High-Resolution PWA Icons...');
    // Admin PWA
    await sharp(adminSvg).resize(192, 192).png().toFile('public/pwa-192x192.png');
    await sharp(adminSvg).resize(512, 512).png().toFile('public/pwa-512x512.png');
    await sharp(adminSvg).resize(512, 512).png().toFile('public/pwa-maskable-512x512.png');
    await sharp(adminSvg).resize(180, 180).png().toFile('public/apple-touch-icon.png');

    // Rider PWA
    await sharp(riderSvg).resize(192, 192).png().toFile('public/rider-192x192.png');
    await sharp(riderSvg).resize(512, 512).png().toFile('public/rider-512x512.png');
    await sharp(riderSvg).resize(512, 512).png().toFile('public/rider-maskable-512x512.png');
    await sharp(riderSvg).resize(180, 180).png().toFile('public/rider-apple-touch-icon.png');

    console.log('📱 Generating Android Launcher Mipmap Assets for Admin & Rider flavors...');

    const densities = [
      { dir: 'mipmap-mdpi', size: 48, fg: 108 },
      { dir: 'mipmap-hdpi', size: 72, fg: 162 },
      { dir: 'mipmap-xhdpi', size: 96, fg: 216 },
      { dir: 'mipmap-xxhdpi', size: 144, fg: 324 },
      { dir: 'mipmap-xxxhdpi', size: 192, fg: 432 }
    ];

    const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;

    // Function to setup flavor mipmaps
    const setupFlavorMipmaps = async (flavorResDir, svgPath, bgColor) => {
      const valuesDir = path.join(flavorResDir, 'values');
      fs.mkdirSync(valuesDir, { recursive: true });
      fs.writeFileSync(
        path.join(valuesDir, 'ic_launcher_background.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${bgColor}</color>\n</resources>\n`
      );

      const anyDpiDir = path.join(flavorResDir, 'mipmap-anydpi-v26');
      fs.mkdirSync(anyDpiDir, { recursive: true });
      fs.writeFileSync(path.join(anyDpiDir, 'ic_launcher.xml'), adaptiveXml);
      fs.writeFileSync(path.join(anyDpiDir, 'ic_launcher_round.xml'), adaptiveXml);

      for (const d of densities) {
        const targetDir = path.join(flavorResDir, d.dir);
        fs.mkdirSync(targetDir, { recursive: true });

        await sharp(svgPath).resize(d.size, d.size).png().toFile(path.join(targetDir, 'ic_launcher.png'));
        await sharp(svgPath).resize(d.size, d.size).png().toFile(path.join(targetDir, 'ic_launcher_round.png'));
        const fgSize = d.fg;
        const innerSize = Math.round(fgSize * 0.72);
        const innerBuf = await sharp(svgPath).resize(innerSize, innerSize).toBuffer();
        await sharp({
          create: {
            width: fgSize,
            height: fgSize,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          }
        })
        .composite([{ input: innerBuf, gravity: 'center' }])
        .png()
        .toFile(path.join(targetDir, 'ic_launcher_foreground.png'));
      }
    };

    // 1. Admin Flavor
    const adminRes = path.resolve('android', 'app', 'src', 'admin', 'res');
    await setupFlavorMipmaps(adminRes, adminSvg, '#0b0f19');

    // 2. Rider Flavor
    const riderRes = path.resolve('android', 'app', 'src', 'rider', 'res');
    await setupFlavorMipmaps(riderRes, riderSvg, '#020617');

    // 3. Main Base Fallback (Admin icon)
    const mainRes = path.resolve('android', 'app', 'src', 'main', 'res');
    await setupFlavorMipmaps(mainRes, adminSvg, '#0b0f19');
  } catch (err) {
    console.warn('⚠️ Notice during icon generation (non-fatal):', err.message);
  }
}

generateAllIcons().then(() => {
  console.log(`🎉 [Sync Completed] Version bumped to ${nextVersion}!`);
}).catch(err => {
  console.error('❌ Error during sync:', err);
  process.exit(1);
});
