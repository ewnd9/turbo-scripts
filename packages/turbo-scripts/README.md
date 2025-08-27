# `@ewnd9/turbo-scripts`

Streamlined Docker image building for Turborepo monorepos with intelligent caching and optimization.

## Features

- **Smart Caching**: Leverages Turborepo's hash-based caching for Docker builds
- **Optimized Pruning**: Only includes necessary dependencies and files
- **Multi-stage Builds**: Efficient layering for smaller production images
- **Registry Integration**: Automatic tagging and pushing with Turbo hashes

## Installation

```sh
$ npm install @ewnd9/turbo-scripts --save-dev
# or
$ yarn add @ewnd9/turbo-scripts -D
# or
$ pnpm add @ewnd9/turbo-scripts -D
```

## Quick Start

### 1. Configure Git Ignore

Add the temporary pruning directories to your `.gitignore`:

```gitignore
.turbo-docker
.turbo-prune
```

### 2. Update Turbo Configuration

Modify your `turbo.json` to include Docker build outputs and containerize task:

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".turbo-docker/**"]
    },
    "containerize": {
      "dependsOn": ["build", "^containerize"],
      "outputs": []
    }
  }
}
```

### 3. Update Package Scripts

Add containerization to your service's `package.json`:

```json
{
  "name": "my-service",
  "scripts": {
    "build": "tsc && mkdir -p .turbo-docker && echo $TURBO_HASH > .turbo-docker/hash",
    "containerize": "turbo-scripts registry.io/my-org"
  }
}
```

### 4. Create Dockerfile

Add a `turbo.Dockerfile` to your service root. The `DIST_DIR` argument is automatically provided:

```dockerfile
FROM node:22-bookworm-slim
WORKDIR /app
ARG DIST_DIR

# Copy package files for dependency installation
COPY ${DIST_DIR}/json .

ENV NODE_ENV=production
RUN apt-get update && \
    apt-get install -y dumb-init && \
    corepack enable && \
    yarn install --frozen-lockfile

# Copy application files
COPY ${DIST_DIR}/full .

EXPOSE 3000
WORKDIR /app/packages/my-service
CMD ["dumb-init", "node", "dist/index.js"]
```

## Usage

Build and push Docker images for all services:

```sh
$ turbo run containerize
```

This will:
1. Build your services with Turbo's caching
2. Generate optimized Docker contexts (via [`turbo prune`](https://turborepo.com/docs/reference/prune))
3. Build Docker images tagged with Turbo hashes
4. Push images to your registry

## How It Works

The tool uses Turborepo's pruning and hashing capabilities to:

- Create minimal Docker contexts containing only necessary files
- Generate deterministic image tags based on content hashes
- Skip rebuilds when nothing has changed
- Optimize layer caching for faster builds

## Configuration

The containerize script accepts a registry prefix as its first argument. Images are tagged as:

```
<registry-prefix>/<service-name>:<turbo-hash>
```

## Requirements

- Node.js 18+
- Docker
- Turborepo workspace

## License

MIT © [ewnd9](https://ewnd9.com)
