import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 [Courier Payout & COD Entry] Building Multi-App Android Flavors...');

// 1. Clean previous build output
if (fs.existsSync('dist')) fs.rmSync('dist', { recursive: true, force: true });
if (fs.existsSync('dist-companion')) fs.rmSync('dist-companion', { recursive: true, force: true });

// 2. Build Admin Web App
console.log('📦 [1/4] Building Admin Web App (Courier Rider Payout)...');
execSync('npx vite build', { stdio: 'inherit', env: { ...process.env, VITE_APP_TARGET: 'admin' } });

// 3. Copy Admin Web Assets to android/app/src/admin/assets/public & android/app/src/main/assets/public
console.log('📂 [2/4] Syncing Admin web assets to Android...');
const adminAssetsDir = path.join('android', 'app', 'src', 'admin', 'assets', 'public');
const mainAssetsDir = path.join('android', 'app', 'src', 'main', 'assets', 'public');
fs.mkdirSync(adminAssetsDir, { recursive: true });
fs.mkdirSync(mainAssetsDir, { recursive: true });
fs.cpSync('dist', adminAssetsDir, { recursive: true });
fs.cpSync('dist', mainAssetsDir, { recursive: true });

// 4. Build Companion Rider Web App
console.log('📦 [3/4] Building Rider Companion App (COD Entry हिसाब किताब)...');
execSync('npx vite build --outDir dist-companion', { 
  stdio: 'inherit', 
  env: { ...process.env, VITE_APP_TARGET: 'cod_companion' } 
});

// 5. Copy Companion Web Assets to android/app/src/rider/assets/public
console.log('📂 [4/4] Syncing Rider Companion web assets to Android...');
const riderAssetsDir = path.join('android', 'app', 'src', 'rider', 'assets', 'public');
fs.mkdirSync(riderAssetsDir, { recursive: true });
fs.cpSync('dist-companion', riderAssetsDir, { recursive: true });

console.log('✅ Android Flavors (Admin & Rider Companion) Assets Synced Successfully!');
