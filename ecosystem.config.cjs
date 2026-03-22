const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const TSX = path.join(ROOT, 'node_modules/.pnpm/node_modules/.bin/tsx');
const STANDALONE = path.join(ROOT, 'apps/web/.next/standalone/Documents/projects/30 Projects/Social Control Plane/apps/web');

// Parse .env so PM2 injects vars directly — no bash wrapper needed
function loadEnv(envPath) {
  const env = {};
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      env[t.slice(0, eq).trim()] = val;
    }
  } catch {}
  return env;
}

const dotenv = loadEnv(path.join(ROOT, '.env'));

module.exports = {
  apps: [
    {
      name: 'scp-web',
      script: 'server.js',
      cwd: STANDALONE,
      interpreter: 'node',
      env: { PORT: 3000, HOSTNAME: '0.0.0.0', NODE_ENV: 'production' },
    },
    {
      name: 'scp-api',
      script: 'src/server.ts',
      cwd: path.join(ROOT, 'apps/api'),
      interpreter: TSX,
      env: dotenv,
    },
    {
      name: 'scp-worker',
      script: 'src/index.ts',
      cwd: path.join(ROOT, 'apps/worker'),
      interpreter: TSX,
      env: dotenv,
    },
  ],
};
