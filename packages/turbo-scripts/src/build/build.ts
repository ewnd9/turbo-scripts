import fs from 'node:fs/promises';
import { execa } from 'execa';

export async function build({
  cmd,
  args,
  silent,
  turboHash,
}: {
  cmd: string;
  args: string[];
  silent: boolean;
  turboHash: string;
}) {
  await execa(cmd, args, { stdio: silent ? 'ignore' : 'inherit' });
  await fs.mkdir('.turbo-docker', { recursive: true });
  await fs.writeFile(`.turbo-docker/hash`, turboHash);
}
