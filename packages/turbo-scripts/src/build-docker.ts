import fs from 'node:fs';
import { execa } from 'execa';
import { globby } from 'globby';
import { $, cd } from 'zx';

export async function buildDocker({
  pkgName,
  cwd,
  imagePrefix,
  packageManager,
}: {
  pkgName: string;
  cwd: string;
  imagePrefix: string;
  packageManager: string;
}) {
  const hash = fs.readFileSync(`${cwd}/.turbo-docker/hash`, 'utf-8').trim();
  const image = `${imagePrefix}/${pkgName}:${hash}`;

  const { rootDir, gitSha, gitIsDirty } = await getGitStats(cwd);

  cd(rootDir);
  const distDir = `.tmp-turbo-prune/${pkgName}`;
  await $`rm -rf ${distDir}`;
  await $`${packageManager} turbo prune --out-dir=${distDir} --docker --use-gitignore=false ${pkgName}`;
  await deleteDevDependencies(`${rootDir}/${distDir}/json`);
  const dockerFile = `${cwd}/turbo.Dockerfile`;
  await $`docker build --platform linux/amd64 --build-arg DIST_DIR=${distDir} --push -f ${dockerFile} -t ${image} --label "GIT_SHA=${gitSha}" --label "GIT_DIRTY=${gitIsDirty}" .`;

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
