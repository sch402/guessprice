#!/usr/bin/env node
/**
 * Capacitor 静态导出构建：Next 的 `output: export` 与 `app/api` 不能共存，
 * 构建前临时移走 `app/api`，结束后再恢复。
 */
import { execSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const apiDir = join(root, 'app', 'api');
const apiBak = join(root, 'app', '_api_cap_disabled');

const runBuild = () => {
  execSync('npx next build', {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, CAP_EXPORT: '1', NODE_ENV: 'production' },
  });
};

if (existsSync(apiDir)) {
  renameSync(apiDir, apiBak);
  try {
    runBuild();
  } finally {
    if (existsSync(apiBak)) {
      renameSync(apiBak, apiDir);
    }
  }
} else {
  runBuild();
}
