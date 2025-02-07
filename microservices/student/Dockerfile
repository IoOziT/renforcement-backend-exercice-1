FROM node:lts AS base

WORKDIR /app

COPY student/package.json student/pnpm-lock.yaml student/tsconfig.json student/

RUN npm i -g corepack@latest && corepack enable


FROM base AS prepare

COPY school/ school/

RUN cd school && pnpm install && pnpm run build

WORKDIR /app/student

RUN pnpm install

COPY student/src/ src/


FROM prepare AS build

RUN pnpm run build

RUN pnpm prune --production


FROM base

WORKDIR /app/student

COPY --from=prepare /app/student/node_modules node_modules/
COPY --from=build /app/student/dist dist/

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 CMD [ "curl", "--fail", "http://localhost:3000/health" ]

CMD [ "node", "dist/index.js" ]