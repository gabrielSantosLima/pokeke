import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronPath = require('electron');

const aliases = {
  dev: 'development',
  development: 'development',
  beta: 'beta',
  prod: 'production',
  production: 'production',
};

const requested = process.argv[2];
const channel = aliases[requested] || (requested ? null : 'development');

if (!channel) {
  console.error(`Unknown channel "${requested}". Use dev, beta or prod.`);
  process.exit(1);
}

const child = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, POKEKE_CHANNEL: channel },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
