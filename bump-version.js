const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, 'app.json');
const packageJsonPath = path.join(__dirname, 'package.json');

let appJson, packageJson;

try {
  appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
} catch (e) {
  console.error('Error reading JSON files:', e);
  process.exit(1);
}

// 1. Aumentar la version de parche (ej: 1.0.0 -> 1.0.1)
const currentVersion = appJson.expo.version || "1.0.0";
const versionParts = currentVersion.split('.');
if (versionParts.length === 3) {
  versionParts[2] = parseInt(versionParts[2], 10) + 1;
}
const newVersion = versionParts.join('.');

appJson.expo.version = newVersion;
packageJson.version = newVersion;

// 2. Aumentar el versionCode de Android (obligatorio para actualizaciones manuales del APK)
if (!appJson.expo.android) {
  appJson.expo.android = {};
}
let versionCode = appJson.expo.android.versionCode || 1;
versionCode += 1;
appJson.expo.android.versionCode = versionCode;

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`\n✅ ¡Versión actualizada exitosamente!`);
console.log(`- Nueva versión (version): ${newVersion}`);
console.log(`- Nuevo código de versión (versionCode): ${versionCode}\n`);
console.log(`Ahora puedes compilar la app y Android permitirá instalar la actualización sobre la versión anterior.\n`);
