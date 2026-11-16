const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');

const assets = path.resolve(__dirname, '..', 'assets');
const svg = fs.readFileSync(path.join(assets, 'icon.svg'));
fs.writeFileSync(path.join(assets, 'icon.png'), new Resvg(svg).render().asPng());
console.log('Generated assets/icon.png (256 × 256).');
