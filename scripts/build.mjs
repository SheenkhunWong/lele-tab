import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const target = process.argv[2] ?? 'chrome';
const allowed = new Set(['chrome', 'firefox']);

if (!allowed.has(target)) {
  throw new Error(`Unknown build target "${target}". Use chrome or firefox.`);
}

const viteBin = resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js');
if (!existsSync(viteBin)) {
  throw new Error('Vite is not installed. Run npm install first.');
}

const args = [viteBin, 'build'];
if (target === 'firefox') args.push('--outDir', 'dist-firefox');

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    LELE_TARGET: target
  },
  shell: process.platform === 'win32'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
