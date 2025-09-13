import * as fs from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { execa } from 'execa';
import jsYaml from 'js-yaml';
import { GenericContainer } from 'testcontainers';
import { beforeAll, expect, onTestFinished, test } from 'vitest';

const turboVersion = '2.5.6';
const __dirname = dirname(fileURLToPath(import.meta.url));
let ctx: TestContext;

interface TestContext {
  dockerRegistryUrl: string;
  verdaccioNpmRcPath: string;
  verdaccioNpmRc: string;
  verdaccioRegistryUrl: string;
  randomPackageVersion: string;
}

beforeAll(setupContainers, 180000); // timeout

test.each([
  ['npm', '10.9.2'],
  ['yarn', '4.9.3'],
  ['pnpm', '10.15.0'],
  // // @TODO: fix npm_package_name is @ewnd9/turbo-scripts instead of "service"
  // ['bun', '1.2.20'],
])(
  'setup %s@%s',
  {
    timeout: 180000,
  },
  async (packageManager: string, packageManagerVersion: string) => {
    const tmpDir = await prepareMonorepoTmpDir(packageManager, packageManagerVersion);
    const dockerImagePrefix = `${ctx.dockerRegistryUrl}/basic-monorepo`;

    async function runTurbo() {
      await execa(`./node_modules/.bin/turbo run --env-mode=loose build containerize`, {
        cwd: tmpDir,
        shell: true,
        env: {
          TURBO_SCRIPTS_REGISTRY_PREFIX: dockerImagePrefix,
          TURBO_SCRIPTS_DOCKERFILE: `turbo-${packageManager}.Dockerfile`,
        },
        // stdio: 'inherit',
      });

      const pkgName = `service`;
      const hash = await fs.readFile(`${tmpDir}/packages/service/.turbo-docker/hash`, 'utf-8');
      const image = `${dockerImagePrefix}/${pkgName}:${hash}`;

      return { image };
    }

    const run0 = await runTurbo();

    const serviceContainer0 = await new GenericContainer(run0.image).withExposedPorts(3000).start();
    const servicePort0 = serviceContainer0.getMappedPort(3000);
    const res0 = await axios.get(`http://localhost:${servicePort0}`);
    expect(res0.status).toEqual(200);
    expect(res0.data).toEqual('Hello World');
    onTestFinished(async () => {
      await serviceContainer0.stop();
    });

    const run1 = await runTurbo();
    // @TODO: parse turbo --summarize to check if cached
    expect(run1.image).toEqual(run0.image);

    await execa('sed -i -e "s/Hello World/Updated Code/g" packages/service/index.js', {
      cwd: tmpDir,
      shell: true,
    });

    const run2 = await runTurbo();
    expect(run2.image).not.toEqual(run0.image);

    const serviceContainer2 = await new GenericContainer(run2.image).withExposedPorts(3000).start();
    const servicePort2 = serviceContainer2.getMappedPort(3000);
    const res2 = await axios.get(`http://localhost:${servicePort2}`);
    expect(res2.status).toEqual(200);
    expect(res2.data).toEqual('Updated Code');
    onTestFinished(async () => {
      await serviceContainer2.stop();
    });
  },
);

async function setupContainers() {
  const [
    { dockerRegistryUrl, registryContainer },
    { verdaccioContainer, verdaccioNpmRcPath, verdaccioNpmRc, verdaccioRegistryUrl },
  ] = await Promise.all([initRegistryContainer(), initVerdaccioContainer()]);

  const randomPackageVersion = `0.0.${Date.now()}`;
  await publishPackage(verdaccioRegistryUrl, verdaccioNpmRcPath, randomPackageVersion);

  ctx = {
    dockerRegistryUrl,
    verdaccioRegistryUrl,
    verdaccioNpmRcPath,
    verdaccioNpmRc,
    randomPackageVersion,
  };

  return async () => {
    await Promise.all([registryContainer.stop(), verdaccioContainer.stop()]);
  };
}

async function prepareMonorepoTmpDir(packageManager: string, packageManagerVersion: string) {
  const tmpDir = await fs.mkdtemp('/tmp/turbo-scripts-');
  await fs.cp(`${__dirname}/../../../../examples/basic-monorepo`, tmpDir, {
    recursive: true,
  });

  await applyPackageManagerConfigs(packageManager, tmpDir);

  await patchJsonFile(`${tmpDir}/package.json`, (pkgJson) => {
    pkgJson.packageManager = `${packageManager}@${packageManagerVersion}`;
    // @ts-expect-error
    pkgJson.devDependencies.turbo = turboVersion;
  });

  await patchJsonFile(`${tmpDir}/packages/service/package.json`, (pkgJson) => {
    pkgJson.devDependencies['@ewnd9/turbo-scripts'] = ctx.randomPackageVersion;
  });

  for (const cmd of [
    'git init',
    'git config user.email "ci@example.com"',
    'git config user.name "ci"',
    'git add .',
    'git commit -m "init"',
    `${packageManager} install`,
  ]) {
    await execa(cmd, {
      cwd: tmpDir,
      shell: true,
      env: {
        npm_config_registry: ctx.verdaccioRegistryUrl,
      },
    });
  }

  return tmpDir;
}

async function initRegistryContainer() {
  // https://hub.docker.com/_/registry
  const registryContainer = await new GenericContainer('registry:3').withExposedPorts(5000).start();
  const dockerRegistryPort = registryContainer.getMappedPort(5000);
  // without http://
  const dockerRegistryUrl = `127.0.0.1:${dockerRegistryPort}`;

  return {
    registryContainer,
    dockerRegistryUrl,
  };
}

async function initVerdaccioContainer() {
  // https://hub.docker.com/r/verdaccio/verdaccio/
  const verdaccioContainer = await new GenericContainer('verdaccio/verdaccio:6.1').withExposedPorts(4873).start();
  const verdaccioPort = verdaccioContainer.getMappedPort(4873);

  const verdaccioNpmRcPath = '/tmp/.npmrc';
  const verdaccioRegistryUrl = `http://localhost:${verdaccioPort}`;
  const verdaccioNpmRc = await buildVerdaccioNpmRc(verdaccioRegistryUrl);
  await fs.writeFile(verdaccioNpmRcPath, verdaccioNpmRc);

  return {
    verdaccioContainer,
    verdaccioNpmRcPath,
    verdaccioNpmRc,
    verdaccioRegistryUrl,
  };
}

async function publishPackage(verdaccioRegistryUrl: string, verdaccioNpmRcPath: string, version: string) {
  const tmpPublishDir = await fs.mkdtemp('/tmp/turbo-scripts-package-');
  // // uncomment for debug
  // console.log({ tmpPublishDir });

  await fs.cp(`${__dirname}/../..`, tmpPublishDir, {
    recursive: true,
  });
  await patchJsonFile(`${tmpPublishDir}/package.json`, (pkgJson) => {
    pkgJson.name = '@ewnd9/turbo-scripts';
    pkgJson.version = version;
    return pkgJson;
  });

  await execa(`npm publish --tag ci --userconfig ${verdaccioNpmRcPath}`, {
    cwd: tmpPublishDir,
    env: {
      npm_config_registry: verdaccioRegistryUrl,
      // couldn't make it work
      // npm_config__authToken: `//localhost:${verdaccioPort}/:_authToken=${token}`,
    },
    stdio: 'ignore', // 'inherit',
    shell: true,
  });
}

async function patchFile(path: string, patch: (content: string) => string) {
  const content = await fs.readFile(path, 'utf-8');
  const patchedContent = patch(content);
  await fs.writeFile(path, patchedContent);
}

async function patchJsonFile(path: string, patch: (pkgJson: Record<string, unknown>) => void) {
  return patchFile(path, (content) => {
    const json = JSON.parse(content);
    patch(json);
    return JSON.stringify(json, null, 2);
  });
}

async function applyPackageManagerConfigs(packageManager: string, tmpDir: string) {
  if (packageManager === 'npm') {
    await fs.writeFile(`${tmpDir}/.npmrc`, ctx.verdaccioNpmRc);
  } else if (packageManager === 'yarn') {
    await fs.writeFile(
      `${tmpDir}/.yarnrc.yml`,
      jsYaml.dump({
        // https://yarnpkg.com/configuration/yarnrc
        nodeLinker: 'node-modules',
        unsafeHttpWhitelist: ['localhost'],
        // we generate new yarn.lock for example
        enableHardenedMode: false,
        enableImmutableInstalls: false,
        npmScopes: {
          ewnd9: {
            npmRegistryServer: ctx.verdaccioRegistryUrl,
          },
        },
      }),
    );
  } else if (packageManager === 'pnpm') {
    await fs.writeFile(
      `${tmpDir}/pnpm-workspace.yaml`,
      jsYaml.dump({
        // https://pnpm.io/pnpm-workspace_yaml
        packages: ['packages/*'],
        registry: 'https://registry.npmjs.org/',
        '@ewnd9:registry': ctx.verdaccioRegistryUrl,
      }),
    );
  }
}

async function buildVerdaccioNpmRc(verdaccioRegistryUrl: string) {
  const username = 'test';
  const password = 'secret';
  const email = 'test@example.com';

  const {
    data: { token },
  } = await axios.put<{ token: string }>(
    `${verdaccioRegistryUrl}/-/user/org.couchdb.user:${encodeURIComponent(username)}`,
    {
      name: username,
      password,
      email,
      type: 'user',
      roles: [],
      date: new Date().toISOString(),
    },
    {
      headers: {
        'content-type': 'application/json',
      },
    },
  );

  return [
    `registry=${verdaccioRegistryUrl}`,
    `@ewnd9:registry=${verdaccioRegistryUrl}`,
    `//localhost:${new URL(verdaccioRegistryUrl).port}/:_authToken=${token}`,
    '\n',
  ].join('\n');
}
