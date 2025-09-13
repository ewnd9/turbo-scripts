# syntax = docker/dockerfile:1.4
FROM node:22-bookworm-slim
WORKDIR /app
ARG DIST_DIR

RUN apt update && \
  apt install -y dumb-init && \
  corepack enable

COPY ${DIST_DIR}/json .

ENV NODE_ENV=production
RUN pnpm install

COPY ${DIST_DIR}/full .

EXPOSE 3000
CMD ["dumb-init", "node", "packages/service/index.js"]
