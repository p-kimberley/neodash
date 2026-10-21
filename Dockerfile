# NeoDash: the UI and its backend in one image. The backend (server/) serves the built UI, handles
# sign-in and runs every Neo4j query, so browsers never connect to Neo4j.
# See docs/deployment.md for deployment and server/README.md for configuration.
#
# The runtime image is distroless: no shell or package manager, runs as an unprivileged user
# (UID 65532) and needs no writable filesystem. It makes no outbound internet requests, so it can
# run in air-gapped clusters (see k8s-deploy/neodash/README.md).

FROM node:22-alpine AS ui
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-engines --network-timeout 600000
COPY .babelrc webpack.config.js tsconfig.json postcss.config.js tailwind.config.js ./
COPY public ./public
COPY src ./src
# The typed JSON codec is shared with the backend.
COPY server/src/codec.ts ./server/src/codec.ts
RUN yarn run build-minimal && rm -f dist/config.json dist/embed-test.html dist/*.map

# Same libc (glibc) as the distroless runtime below.
FROM node:22-bookworm-slim AS server
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM gcr.io/distroless/nodejs22-debian12:nonroot@sha256:13593b7570658e8477de39e2f4a1dd25db2f836d68a0ba771251572d23bb4f8e
ENV NODE_ENV=production \
    STATIC_DIR=/app/public
WORKDIR /app
# Everything is owned by root and read-only for the runtime user.
COPY --from=server /app/node_modules ./node_modules
COPY --from=server /app/dist ./dist
COPY --from=server /app/package.json ./
COPY --from=ui /app/dist ./public
USER 65532:65532
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# The base image's entrypoint is node.
CMD ["dist/index.js"]
