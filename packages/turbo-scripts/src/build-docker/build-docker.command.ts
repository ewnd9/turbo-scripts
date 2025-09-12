import { getPackages } from '@manypkg/get-packages';
import { Command, Option } from 'clipanion';
import { cleanEnv, str } from 'envalid';

export class BuildDockerCommand extends Command {
  name = Option.String();
  silent = Option.Boolean('--silent', { required: false });
  static paths = [[`build:docker`]];

  async execute() {
    const env = cleanEnv(process.env, {
      npm_package_name: str(),
    });

    const cwd = process.cwd();
    const {
      tool: { type: packageManager },
    } = await getPackages(cwd);

    const { buildDocker } = await import('./build-docker.js');
    await buildDocker({
      pkgName: env.npm_package_name,
      packageManager,
      cwd,
      imagePrefix: this.name,
      silent: this.silent,
    });
  }
}
