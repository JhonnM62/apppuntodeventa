const fs = require('fs');
const path = require('path');
const dir = 'C:/APIS_v2.3/puntodeventafront/src/screens/inventario';

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    const regex = /placeholder="0"(?!\s*placeholderTextColor)/g;
    if (regex.test(content)) {
        content = content.replace(regex, 'placeholder="0" placeholderTextColor="#9ca3af"');
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Modified placeholder in', path.basename(filePath));
    }
}

fs.readdirSync(dir).forEach(file => {
    if (file.endsWith('.tsx')) {
        processFile(path.join(dir, file));
    }
});
