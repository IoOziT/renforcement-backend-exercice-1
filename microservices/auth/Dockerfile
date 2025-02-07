FROM node:lts AS base

WORKDIR /app

COPY package.json pnpm-lock.yaml tsconfig.json ./

RUN npm i -g corepack@latest && corepack enable


FROM base AS build

RUN pnpm install

COPY src/ src/

RUN pnpm run build
RUN pnpm prune --production


FROM base

COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/dist dist/

VOLUME [ "/app/data" ]
VOLUME [ "/app/keys" ]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 CMD [ "curl", "--fail", "http://localhost:3000/health" ]

CMD [ "node", "dist/index.js" ]