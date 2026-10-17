import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const item of ['index.html', 'src', 'assets', '.nojekyll']) {
  await cp(path.join(root, item), path.join(dist, item), { recursive: true });
}
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)=["'](\.\/[^"']+)["']/g)) {
  await stat(path.resolve(dist, match[1]));
}
await writeFile(path.join(dist, 'build-info.json'), JSON.stringify({ name: 'Villages', format: 'static-esm', version: JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version }, null, 2));
console.log('Static build ready in dist/ — all runtime assets are local and relative.');

