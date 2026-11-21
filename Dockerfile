# syntax=docker/dockerfile:1
FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY . .
# These are public browser configuration only. Never pass signer/API secrets.
ARG NEXT_PUBLIC_BSC_RPC_URL=https://bsc-dataseed-public.bnbchain.org
ARG NEXT_PUBLIC_CHAIN_ID=56
ARG NEXT_PUBLIC_AGENT_ID_REGISTRY=0x60b9262456de011f7d15a54cdd8c48baaa8b022f
ARG NEXT_PUBLIC_PREMORTEM_REGISTRY=
ARG NEXT_PUBLIC_PREMORTEM_CODE_HASH=
ARG NEXT_PUBLIC_DEPLOYMENT_BLOCK=
ARG NEXT_PUBLIC_SITE_URL=
ENV NEXT_PUBLIC_BSC_RPC_URL=$NEXT_PUBLIC_BSC_RPC_URL \
    NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID \
    NEXT_PUBLIC_AGENT_ID_REGISTRY=$NEXT_PUBLIC_AGENT_ID_REGISTRY \
    NEXT_PUBLIC_PREMORTEM_REGISTRY=$NEXT_PUBLIC_PREMORTEM_REGISTRY \
    NEXT_PUBLIC_PREMORTEM_CODE_HASH=$NEXT_PUBLIC_PREMORTEM_CODE_HASH \
    NEXT_PUBLIC_DEPLOYMENT_BLOCK=$NEXT_PUBLIC_DEPLOYMENT_BLOCK \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN pnpm build

FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/web ./apps/web
COPY --from=build --chown=node:node /app/packages/core ./packages/core
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
WORKDIR /app/apps/web
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
