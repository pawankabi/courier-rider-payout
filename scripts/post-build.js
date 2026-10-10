import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const buildDir = path.resolve('build');

if (!fs.existsSync(distDir)) {
  console.error('❌ Build failed: dist directory does not exist!');
  process.exit(1);
}

const distFiles = fs.readdirSync(distDir);
if (distFiles.length === 0) {
  console.error('❌ Build failed: dist directory is empty!');
  process.exit(1);
}

// Ensure build directory is also populated for platforms looking for build/
fs.rmSync(buildDir, { recursive: true, force: true });
fs.cpSync(distDir, buildDir, { recursive: true });

// Mirror fresh dist build to Android assets to ensure Android APK has latest clean white theme UI
const androidPublicDirs = [
  path.resolve('android', 'app', 'src', 'main', 'assets', 'public'),
  path.resolve('android', 'app', 'src', 'rider', 'assets', 'public'),
  path.resolve('android', 'app', 'src', 'admin', 'assets', 'public')
];

for (const targetDir of androidPublicDirs) {
  try {
    const parentDir = path.dirname(targetDir);
    if (fs.existsSync(parentDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      fs.cpSync(distDir, targetDir, { recursive: true });
      console.log(`   - Synced fresh web assets to ${path.relative(process.cwd(), targetDir)}`);
    }
  } catch (err) {
    console.warn('Android asset sync notice:', err);
  }
}

console.log(`✅ Build artifacts validated:`);
console.log(`   - dist/ contains ${distFiles.length} top-level entries`);
console.log(`   - build/ mirrored successfully (${fs.readdirSync(buildDir).length} entries)`);
console.log(`   - index.html size: ${fs.statSync(path.join(distDir, 'index.html')).size} bytes`);
