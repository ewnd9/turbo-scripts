#!/usr/bin/env node

import { Builtins, Cli } from 'clipanion';
import { BuildDockerCommand } from './build-docker/build-docker.command.js';

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function main() {
  const [node, app, ...args] = process.argv;

  const cli = new Cli({
    binaryLabel: `turbo-scripts`,
    binaryName: `${node} ${app}`,
    binaryVersion: `1.0.0`,
  });

  cli.register(Builtins.HelpCommand);
  cli.register(Builtins.VersionCommand);

  cli.register(BuildDockerCommand);

  cli.runExit(args);
}
