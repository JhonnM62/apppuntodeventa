const fs = require('fs');
const path = require('path');
const dir = 'C:/APIS_v2.3/puntodeventafront/src/screens/inventario';

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    content = content.replace(/<TextInput([\s\S]*?)>/g, (match, p1) => {
        if (!match.includes('placeholderTextColor') && match.includes('placeholder=')) {
            changed = true;
            return '<TextInput placeholderTextColor="#9ca3af"' + p1 + '>';
        }
        return match;
    });

    if (filePath.endsWith('ProductoDetailScreen.tsx')) {
        if (content.includes("recetaQtyInput: { width: 50, textAlign: 'center', paddingVertical: 6 },")) {
            content = content.replace(
                "recetaQtyInput: { width: 50, textAlign: 'center', paddingVertical: 6 },",
                "recetaQtyInput: { width: 50, textAlign: 'center', paddingVertical: 6, color: '#111827' },"
            );
            changed = true;
        }
    }

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Modified', path.basename(filePath));
    }
}

fs.readdirSync(dir).forEach(file => {
    if (file.endsWith('.tsx')) {
        processFile(path.join(dir, file));
    }
});
