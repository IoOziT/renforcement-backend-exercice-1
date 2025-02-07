FROM node:lts AS base

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm i -g corepack@latest && corepack enable pnpm


FROM base AS build

RUN pnpm install

COPY tsconfig.json ./
COPY src/ src/

RUN pnpm run build
RUN pnpm prune --production


FROM base

COPY --from=build /app/dist dist/
COPY --from=build /app/node_modules node_modules/

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 CMD [ "curl", "--fail", "http://localhost:3000/health" ]

ENTRYPOINT [ "node", "dist/index.js" ]