#!/usr/bin/env node

import { getPackages } from '@manypkg/get-packages';
import { cleanEnv, str } from 'envalid';
import { buildDocker } from './build-docker.js';

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function main() {
  const { npm_package_name: pkgName } = cleanEnv(process.env, {
    npm_package_name: str(),
  });

  const cwd = process.cwd();
  const {
    tool: { type: packageManager },
  } = await getPackages(cwd);

  await buildDocker({
    pkgName,
    packageManager,
    cwd,
    imagePrefix: process.argv[2]!,
  });
}
