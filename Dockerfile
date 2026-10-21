# NeoDash: the UI and its backend in one image. The backend (server/) serves the built UI, handles
# sign-in and runs every Neo4j query, so browsers never connect to Neo4j.
# See server/README.md for configuration. The previous nginx-only image is Dockerfile.legacy.

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
RUN yarn run build-minimal && rm -f dist/config.json

FROM node:22-alpine AS server
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production \
    STATIC_DIR=/app/public
WORKDIR /app
COPY --from=server /app/node_modules ./node_modules
COPY --from=server /app/dist ./dist
COPY server/package.json ./
COPY --from=ui /app/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "dist/index.js"]
