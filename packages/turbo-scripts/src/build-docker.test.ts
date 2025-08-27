import * as fs from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPackages } from '@manypkg/get-packages';
import axios from 'axios';
import { execa } from 'execa';
import { GenericContainer } from 'testcontainers';
import { expect, onTestFinished, test } from 'vitest';
import { buildDocker } from './build-docker.js';

test.each(['basic-pnpm-monorepo', 'basic-yarn-monorepo'])(
  'setup %s',
  {
    timeout: 180000,
  },
  async (exampleDirectory: string) => {
    // https://hub.docker.com/_/registry
    const registryContainer = await new GenericContainer('registry:3').withExposedPorts(5000).start();
    const registryPort = registryContainer.getMappedPort(5000);
    onTestFinished(async () => {
      await registryContainer.stop();
    });

    const tmpDir = await fs.mkdtemp('/tmp/turbo-scripts-');
    onTestFinished(async () => {
      await fs.rm(tmpDir, { recursive: true });
    });

    const __dirname = dirname(fileURLToPath(import.meta.url));
    await fs.cp(`${__dirname}/../examples/${exampleDirectory}`, tmpDir, {
      recursive: true,
    });

    const {
      tool: { type: packageManager },
    } = await getPackages(tmpDir);

    for (const cmd of [
      'git init',
      'git config user.email "ci@example.com"',
      'git config user.name "ci"',
      'git add .',
      'git commit -m "init"',
      `${packageManager} install`,
      `${packageManager} turbo run build`,
    ]) {
      await execa(cmd, {
        cwd: tmpDir,
        shell: true,
      });
    }

    const pkgName = `turbo-scripts-example-basic-${packageManager}-monorepo-service`;
    const cwd = `${tmpDir}/packages/service`;
    // https://stackoverflow.com/a/70598820
    const imagePrefix = `127.0.0.1:${registryPort}/basic-${packageManager}-monorepo`;

    const run0 = await buildDocker({
      pkgName,
      packageManager,
      cwd,
      imagePrefix,
    });

    const serviceContainer0 = await new GenericContainer(run0.image).withExposedPorts(3000).start();
    const servicePort0 = serviceContainer0.getMappedPort(3000);
    const res0 = await axios.get(`http://localhost:${servicePort0}`);
    expect(res0.status).toEqual(200);
    expect(res0.data).toEqual('Hello World');
    onTestFinished(async () => {
      await serviceContainer0.stop();
    });

    const run1 = await buildDocker({
      pkgName,
      packageManager,
      cwd,
      imagePrefix,
    });
    expect(run1.hash).toEqual(run0.hash);
    expect(run1.image).toEqual(run0.image);

    for (const cmd of [
      'sed -i -e "s/Hello World/Updated Code/g" packages/service/index.js',
      `${packageManager} turbo run build`,
    ]) {
      await execa(cmd, {
        cwd: tmpDir,
        shell: true,
      });
    }

    const run2 = await buildDocker({
      pkgName,
      packageManager,
      cwd,
      imagePrefix,
    });
    expect(run2.hash).not.toEqual(run0.hash);
    expect(run2.image).not.toEqual(run0.image);

    const serviceContainer2 = await new GenericContainer(run0.image).withExposedPorts(3000).start();
    const servicePort2 = serviceContainer2.getMappedPort(3000);
    const res2 = await axios.get(`http://localhost:${servicePort2}`);
    expect(res2.status).toEqual(200);
    expect(res2.data).toEqual('Hello World');
    onTestFinished(async () => {
      await serviceContainer2.stop();
    });
  },
);
