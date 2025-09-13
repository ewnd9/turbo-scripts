import { getPackages } from '@manypkg/get-packages';
import { Command, Option } from 'clipanion';
import { bool, cleanEnv, str } from 'envalid';

export class BuildDockerCommand extends Command {
  name = Option.String();
  silent = Option.Boolean('--silent', false);
  dockerfileName = Option.String('--dockerfile', 'Dockerfile');
  static paths = [[`build:docker`]];

  async execute() {
    const env = cleanEnv(process.env, {
      npm_package_name: str(),
      TURBO_SCRIPTS_DEPLOY_KILL_SWITCH: bool({ default: false }),
    });

    if (env.TURBO_SCRIPTS_DEPLOY_KILL_SWITCH) {
      console.error(`TURBO_SCRIPTS_DEPLOY_KILL_SWITCH activated, exit 1`);
      process.exit(1);
    }

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
      dockerfileName: this.dockerfileName,
    });
  }
}
