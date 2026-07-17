const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const inputDir = path.join(process.cwd(), 'covers');
const outputDir = path.join(process.cwd(), 'public', 'covers');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

fs.readdirSync(inputDir).forEach(file => {
    if (file.endsWith('.jpg') || file.endsWith('.jpeg')) {
        const inputPath = path.join(inputDir, file);
        const outputPath = path.join(outputDir, file.replace(/\.jpe?g$/, '.webp'));
        
        sharp(inputPath)
            .resize(700, 700, {
                fit: 'cover',
                position: 'center'
            })
            .webp({ quality: 80 })
            .toFile(outputPath)
            .then(info => {
                console.log(`Converted ${file} to WebP (700x700). Size: ${info.size} bytes`);
            })
            .catch(err => {
                console.error(`Error converting ${file}:`, err);
            });
    }
});
