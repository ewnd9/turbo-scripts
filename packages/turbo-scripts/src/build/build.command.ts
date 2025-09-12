import { Command, Option } from 'clipanion';
import { bool, cleanEnv, str } from 'envalid';

export class BuildCommand extends Command {
  silent = Option.Boolean('--silent', { required: false });
  // "and thus require at least one path component"
  // https://github.com/arcanis/clipanion/issues/85#issuecomment-825743214
  cmd = Option.String();
  args = Option.Proxy();
  static paths = [[`build`]];
  static usage = Command.Usage({
    description: `Run a specified command and store TURBO_HASH for building docker/deploying`,
    examples: [[`A basic example`, `$0 build -- next build`]],
  });

  async execute() {
    const env = cleanEnv(process.env, {
      TURBO_HASH: str(),
      TURBO_SCRIPTS_DEPLOY_KILL_SWITCH: bool({ default: false }),
    });

    if (env.TURBO_SCRIPTS_DEPLOY_KILL_SWITCH) {
      console.error(`TURBO_SCRIPTS_DEPLOY_KILL_SWITCH activated, exit 1`);
      process.exit(1);
    }

    const { build } = await import('./build.js');
    await build({
      cmd: this.cmd,
      args: this.args,
      turboHash: env.TURBO_HASH,
      silent: this.silent,
    });
  }
}
