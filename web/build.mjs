// Vercel build step: stamps the commit into every module and stylesheet URL, so a deploy is never
// served from a stale cache, and writes version.json so a running page can tell that a newer
// version is live. Local development needs no build: without the stamp everything works as is.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const v = (process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())).slice(0, 12);
const stamp = (s) => s.replace(/(from\s+'\.\/[\w-]+\.js)(')/g, `$1?v=${v}$2`).replace(/(import\(\s*'\.\/[\w-]+\.js)(')/g, `$1?v=${v}$2`);
for (const f of readdirSync('js').filter((x) => x.endsWith('.js'))) writeFileSync(`js/${f}`, stamp(readFileSync(`js/${f}`, 'utf8')));
writeFileSync('index.html', readFileSync('index.html', 'utf8').replace('src="js/app.js"', `src="js/app.js?v=${v}"`).replace('href="styles.css"', `href="styles.css?v=${v}"`));
writeFileSync('version.json', JSON.stringify({ v }) + '\n');
console.log('stamped build', v);
