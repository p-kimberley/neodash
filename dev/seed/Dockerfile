FROM node:22-alpine
WORKDIR /seed
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY *.mjs ./
USER node
CMD ["node", "seed.mjs"]
