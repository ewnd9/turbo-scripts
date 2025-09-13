# syntax = docker/dockerfile:1.4
FROM node:22-bookworm-slim
WORKDIR /app
ARG DIST_DIR

RUN apt update && \
  apt install -y dumb-init

COPY ${DIST_DIR}/json .

ENV NODE_ENV=production
RUN npm ci

COPY ${DIST_DIR}/full .

EXPOSE 3000
CMD ["dumb-init", "node", "packages/service/index.js"]
