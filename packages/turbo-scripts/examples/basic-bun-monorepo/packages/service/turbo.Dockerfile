# syntax = docker/dockerfile:1.4
FROM oven/bun:1
WORKDIR /app
ARG DIST_DIR

RUN apt update && \
  apt install -y dumb-init

COPY ${DIST_DIR}/json .

ENV NODE_ENV=production
RUN bun install

COPY ${DIST_DIR}/full .

EXPOSE 3000
CMD ["dumb-init", "node", "packages/service/index.js"]
