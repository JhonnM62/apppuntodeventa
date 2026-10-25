const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, 'app.json');

let appJson;

try {
  appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
} catch (e) {
  console.error('Error reading app.json:', e);
  process.exit(1);
}

// 1. Aumentar la version de parche en app.json (no tocar package.json para no invalidar caché de Docker)
const currentVersion = appJson.expo.version || "1.0.0";
const versionParts = currentVersion.split('.');
if (versionParts.length === 3) {
  versionParts[2] = parseInt(versionParts[2], 10) + 1;
}
const newVersion = versionParts.join('.');

appJson.expo.version = newVersion;

// 2. Aumentar el versionCode de Android (obligatorio para actualizaciones manuales del APK)
if (!appJson.expo.android) {
  appJson.expo.android = {};
}
let versionCode = appJson.expo.android.versionCode || 1;
versionCode += 1;
appJson.expo.android.versionCode = versionCode;

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

console.log(`\n✅ ¡Versión actualizada exitosamente en app.json!`);
console.log(`- Nueva versión (version): ${newVersion}`);
console.log(`- Nuevo código de versión (versionCode): ${versionCode}\n`);
console.log(`Ahora puedes compilar la app y Android permitirá instalar la actualización sobre la versión anterior.\n`);
