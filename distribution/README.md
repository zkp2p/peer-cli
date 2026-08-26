# Peer CLI and MCP distribution pack

Ready-to-apply submissions for every external GitHub target in the agents.peer.xyz
distribution push. Authored 2026-08-26 against each target's live contribution
rules on that date. The executing credential needs write access to external
public repos (fork push + PR/issue creation); the Shoku runner's fine-grained
PAT is scoped to zkp2p repos only, which is why this pack exists.

Already done (no action needed):

- Base ecosystem form: submitted 2026-08-26, confirmation received.
- TensorBlock: blocked on the same credential; body in `issues/tensorblock.md`.
- DeFiLlama: already lists us as "Peer" (slug `peer`, twitter `peerxyz`); no PR needed.
- Official MCP registry: workflow YAML in issue #13; needs a workflow-scoped
  credential to commit `.github/workflows/publish-mcp.yml`, then one dispatch.

Execution order:

1. Issue #13 first (official registry publish). Glama, PulseMCP, the GitHub MCP
   registry, and the VS Code gallery ingest from it, and hive-intel treats
   registry presence as a credibility signal.
2. `awesome-lists.md`: five one-line PRs (punkpeye, jaw9c, hive-intel, sodofi,
   royyannick).
3. `llms-txt-hub/peer-llms-txt.mdx`: one-file PR to thedaviddias/llms-txt-hub
   at `packages/content/data/websites/peer-llms-txt.mdx`.
4. `base-skills/peer.md`: PR to base/skills at `skills/base-mcp/plugins/peer.md`.
   Run their `/plugin-review` skill before opening the PR. Do not touch
   SKILL.md or the Examples column (maintainer-managed).
5. `bankr-skill/`: PR to BankrBot/skills as folder `peer/` plus one README
   table row.
6. `docker-mcp-registry/servers/peer/`: PR to docker/mcp-registry (three files,
   remote server, no Dockerfile).
7. `issues/tensorblock.md` and `issues/cline-marketplace.md`: one issue each.

Dead ends re-verified 2026-08-26, do not attempt:

- block/goose "MCP Servers in the Wild" discussion: no such discussion exists.
- mcpservers.org, mcp.so, mcpmarket.com, cursor.directory, PulseMCP submit:
  bot-walled (Cloudflare or Vercel checkpoint), need a human browser session.
- Smithery, Continue hub, ClawHub: account login required.
