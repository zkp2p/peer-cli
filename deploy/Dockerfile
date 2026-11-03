FROM node:22.23.4-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --fund=false
COPY tsconfig.json tsup.config.ts vitest.config.ts eslint.config.mjs ./
COPY src ./src
COPY scripts ./scripts
COPY tests ./tests
COPY deploy/runtime.cjs ./deploy/runtime.cjs
COPY agents ./agents
COPY skills ./skills
COPY mcp.json plugin.json server.json README.md LICENSE CHANGELOG.md AGENTS.md CLAUDE.md llms.txt ./
RUN npm run check
RUN npm prune --omit=dev --ignore-scripts --no-audit --fund=false

FROM node:22.23.4-bookworm-slim
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/deploy/runtime.cjs /opt/peer/runtime.cjs
ENV PORT=8080 HOME=/tmp
USER 10001:10001
CMD ["node", "/opt/peer/runtime.cjs", "dist/cli.cjs", "mcp", "--transport", "http", "--profile", "read-only", "--host", "127.0.0.1"]
