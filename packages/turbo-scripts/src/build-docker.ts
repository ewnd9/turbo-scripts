import fs from 'node:fs';
import { execa } from 'execa';
import { globby } from 'globby';

export async function buildDocker({
  pkgName,
  cwd,
  imagePrefix,
  packageManager,
  silent,
}: {
  pkgName: string;
  cwd: string;
  imagePrefix: string;
  packageManager: string;
  silent: boolean;
}) {
  const hash = fs.readFileSync(`${cwd}/.turbo-docker/hash`, 'utf-8').trim();
  const image = `${imagePrefix}/${pkgName}:${hash}`;

  const { rootDir, gitSha, gitIsDirty } = await getGitStats(cwd);

  const distDir = `.turbo-prune/${pkgName}`;
  await execa('rm', ['-rf', distDir], { cwd: rootDir });
  await execa(
    packageManager,
    [
      packageManager === 'npm' ? 'exec' : null,
      'turbo',
      'prune',
      packageManager === 'npm' ? '--' : null,
      `--out-dir=${distDir}`,
      `--docker`,
      `--use-gitignore=false`,
      pkgName,
    ].filter(Boolean),
    {
      cwd: rootDir,
    },
  );
  await deleteDevDependencies(`${rootDir}/${distDir}/json`);
  const dockerFile = `${cwd}/turbo.Dockerfile`;
  await execa(
    'docker',
    [
      'build',
      // in case we are building on macOS
      '--platform',
      'linux/amd64',
      // used for caching, see reference turbo.Dockerfile
      '--build-arg',
      `DIST_DIR=${distDir}`,
      //
      '--push',
      //
      '--file',
      dockerFile,
      //
      '--tag',
      image,
      //
      '--label',
      `GIT_SHA=${gitSha}`,
      //
      '--label',
      `GIT_DIRTY=${gitIsDirty}`,
      '.',
    ],
    { cwd: rootDir, ...(!silent && { stdio: 'inherit' }) },
  );

  return {
    hash,
    image,
    gitSha,
    gitIsDirty,
  };
}

async function deleteDevDependencies(cwd: string) {
  const files = await globby('**/package.json', { cwd });
  for (const file of files) {
    const pkg = JSON.parse(fs.readFileSync(`${cwd}/${file}`, 'utf-8'));
    delete pkg.devDependencies;
    fs.writeFileSync(`${cwd}/${file}`, JSON.stringify(pkg, null, 2));
  }
}

export async function getGitStats(cwd: string) {
  const [{ stdout: rootDir }, { stdout: gitSha }, { stdout: gitDirtyFiles }] = await Promise.all(
    [`git rev-parse --show-toplevel`, `git rev-parse HEAD`, `git diff --stat`].map((cmd) =>
      execa(cmd, { cwd, shell: true }),
    ),
  );

  return { rootDir, gitSha, gitIsDirty: Boolean(gitDirtyFiles) };
}
