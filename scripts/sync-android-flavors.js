import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 [Courier Payout & COD Entry] Building Multi-App Android Flavors...');

// 1. Clean previous build output & existing Android public asset directories
if (fs.existsSync('dist')) fs.rmSync('dist', { recursive: true, force: true });
if (fs.existsSync('dist-companion')) fs.rmSync('dist-companion', { recursive: true, force: true });

const adminAssetsDir = path.join('android', 'app', 'src', 'admin', 'assets', 'public');
const riderAssetsDir = path.join('android', 'app', 'src', 'rider', 'assets', 'public');
const mainAssetsDir = path.join('android', 'app', 'src', 'main', 'assets', 'public');

if (fs.existsSync(adminAssetsDir)) fs.rmSync(adminAssetsDir, { recursive: true, force: true });
if (fs.existsSync(riderAssetsDir)) fs.rmSync(riderAssetsDir, { recursive: true, force: true });
// Clean main assets public so it does not conflict or bleed into flavors
if (fs.existsSync(mainAssetsDir)) fs.rmSync(mainAssetsDir, { recursive: true, force: true });

// 2. Build Admin Web App (VITE_APP_TARGET=admin)
console.log('📦 [1/4] Building Admin Web App (Courier Rider Payout: VITE_APP_TARGET=admin)...');
execSync('npx vite build --outDir dist', { 
  stdio: 'inherit', 
  env: { ...process.env, VITE_APP_TARGET: 'admin' } 
});

// 3. Copy Admin Web Assets strictly to android/app/src/admin/assets/public
console.log('📂 [2/4] Syncing Admin web assets strictly to android/app/src/admin/assets/public...');
fs.mkdirSync(adminAssetsDir, { recursive: true });
fs.cpSync('dist', adminAssetsDir, { recursive: true });

// Write flavor-specific capacitor.config.json for Admin
const adminCapConfig = {
  appId: 'com.courierpayout.app',
  appName: 'Courier Rider Payout',
  webDir: 'public',
  server: {
    androidScheme: 'https',
    hostname: 'courier-rider-payout.firebaseapp.com'
  }
};
fs.writeFileSync(path.join('android', 'app', 'src', 'admin', 'assets', 'capacitor.config.json'), JSON.stringify(adminCapConfig, null, 2));

const pluginsJsonPath = path.join('android', 'app', 'src', 'main', 'assets', 'capacitor.plugins.json');
if (fs.existsSync(pluginsJsonPath)) {
  fs.copyFileSync(pluginsJsonPath, path.join('android', 'app', 'src', 'admin', 'assets', 'capacitor.plugins.json'));
}

// 4. Build Companion Rider Web App (VITE_APP_TARGET=cod_companion)
console.log('📦 [3/4] Building Rider Companion App (COD Entry हिसाब किताब: VITE_APP_TARGET=cod_companion)...');
execSync('npx vite build --outDir dist-companion', { 
  stdio: 'inherit', 
  env: { ...process.env, VITE_APP_TARGET: 'cod_companion' } 
});

// 5. Copy Companion Web Assets strictly to android/app/src/rider/assets/public
console.log('📂 [4/4] Syncing Rider Companion web assets strictly to android/app/src/rider/assets/public...');
fs.mkdirSync(riderAssetsDir, { recursive: true });
fs.cpSync('dist-companion', riderAssetsDir, { recursive: true });

// Write flavor-specific capacitor.config.json for Rider
const riderCapConfig = {
  appId: 'com.courierpayout.codentry',
  appName: 'COD Entry (हिसाब किताब)',
  webDir: 'public',
  server: {
    androidScheme: 'https',
    hostname: 'cod-entry-rider.firebaseapp.com'
  }
};
fs.writeFileSync(path.join('android', 'app', 'src', 'rider', 'assets', 'capacitor.config.json'), JSON.stringify(riderCapConfig, null, 2));

if (fs.existsSync(pluginsJsonPath)) {
  fs.copyFileSync(pluginsJsonPath, path.join('android', 'app', 'src', 'rider', 'assets', 'capacitor.plugins.json'));
}

console.log('✅ Android Flavors (Admin & Rider Companion) Assets Synced Successfully!');
