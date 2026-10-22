// Writes .br and .gz copies of the built UI's text assets, which the backend serves to browsers that
// accept them (@fastify/static preCompressed). Mostly for the bundle and the map data
// (the region shapes are 5 MB as JSON, a few hundred KB compressed).
//
//   node scripts/precompress.mjs <dir>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.argv[2];
if (!root) {
  console.error('usage: node scripts/precompress.mjs <dir>');
  process.exit(1);
}

const EXTENSIONS = new Set(['.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map', '.html']);
const MIN_BYTES = 1024;

const files = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  });

let before = 0;
let after = 0;
for (const file of files(root)) {
  // index.html is also served for client-side routes, so it is left as is.
  if (!EXTENSIONS.has(path.extname(file)) || fs.statSync(file).size < MIN_BYTES) {
    continue;
  }
  const data = fs.readFileSync(file);
  const br = zlib.brotliCompressSync(data, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length },
  });
  const gz = zlib.gzipSync(data, { level: 9 });
  fs.writeFileSync(`${file}.br`, br);
  fs.writeFileSync(`${file}.gz`, gz);
  before += data.length;
  after += br.length;
}
console.log(`precompressed ${(before / 1048576).toFixed(1)} MB of assets to ${(after / 1048576).toFixed(1)} MB (brotli)`);
