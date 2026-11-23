# Hosted MCP on AWS

The production endpoint is `https://mcp.peer.xyz/mcp`, with health at
`https://mcp.peer.xyz/health`. The hosted server uses the read-only HTTP profile;
signing and broadcasting remain unavailable.

## Continuous deployment

Push to `releases/prod` to deploy through the Peer Deploy Platform:

1. `zkp2p/.github` `build-deploy-image-public.yml` builds `deploy/Dockerfile`
   on a fixed GitHub-hosted `ubuntu-24.04` runner. The build runs `npm ci`,
   `npm run check` and production dependency pruning. CI (`ci.yml`,
   `ubuntu-latest`) also starts the image and requires HTTP 200 from
   `http://127.0.0.1:8080/health`.
2. The image job assumes `peer-deploy-artifacts-mcp` through GitHub OIDC and
   uploads the immutable `mcp-image` artifact to S3. The reusable workflow emits
   the artifact key, manifest SHA-256 and image ID.
3. The deploy job resolves `deploy/environments.yml`, requires successful CI
   for the source SHA, and assumes `peer-deploy-mcp-prod` through GitHub OIDC.
4. SSM document `peer-deploy-mcp-prod` runs Peer Deploy's blue-green image
   deployment on `peer-mcp-prod` (`i-04825e6d16a3b5586`, `us-east-1`). The platform
   verifies the artifact and candidate health at `/health` before switching
   traffic. Command logs go to `/peer/deploy/mcp`; GitHub records deployment
   status.

This is a public repository: all CI and deployment jobs run on GitHub-hosted
runners. No repository runner variable or self-hosted fleet is needed. CI needs
no secrets, and artifact upload and deployment use short-lived OIDC credentials.
The build and deploy reusable workflows are pinned to reviewed commits in
`.github/workflows/deploy.yml`.

A manual **Deploy** dispatch on `releases/prod` redeploys in `image` mode with
`reason` `manual`. `peer-config-reconciler` (peer-infra `stacks/config-cd`)
dispatches `mode=image` with `reason=reconcile`; those runs are named
`Deploy releases/prod (reconcile)`.

Deploys on the same branch are serialized and do not cancel an in-progress
deployment. Key removal is disabled. Every deploy goes through this workflow:
anyone authorized may push `releases/prod` or dispatch **Deploy**, but nobody
deploys or rebuilds by hand on the host or edits the host's deploy tooling.
Operator access to the host is AWS Systems Manager only. The npm and MCP
Registry release order is in the [README](../README.md#release-deploy-and-publish).

## Rollback

- **Code:** move `releases/prod` to the last known-good commit and push it
  (`--force-with-lease` when moving backward). CI must pass for that commit, and
  the same pipeline redeploys it blue-green. A candidate that fails `/health`
  never receives traffic. Host-level recovery is described in peer-infra
  `tools/peer-deploy/README.md`.
- **Config:** revert the value in Infisical; config CD redeploys it. To stop
  config CD from deploying further Infisical changes, set target `mcp/prod` to
  `observe` per peer-infra `stacks/config-cd/RUNBOOK.md` ("Pause a target").
- npm and MCP Registry versions are not rolled back; publish a new version.

## Configuration

Infisical is the source of truth: project `mcp`
(`8e401af5-448e-4ef7-97f6-e5c670439e1d`), env `prod`, path `/`. Its webhook marks
config-CD target `mcp/prod`; the reconciler publishes the Secrets Manager
snapshot `peer/mcp/prod` and dispatches a `Deploy releases/prod (reconcile)` run.
Each image deploy writes the snapshot to a per-attempt file under
`/etc/peer-mcp/env` and binds it read-only at `/run/secrets/runtime.json`.
`PORT` and keys matching `*_NEXT` are excluded. Host edits do not persist across
deploys.

`deploy/runtime.cjs` requires `NODE_ENV` and accepts one optional key,
`PEER_CASH_RELAY_API_KEY`, which `peer_cash_quote_source` needs for Relay quotes.
Any other key in Infisical makes the reconcile deploy fail its health check and
roll back; change the loader's key sets and deploy it first, then edit Infisical.

## Image and local verification

Build with `docker build -f deploy/Dockerfile -t peer-mcp:local .`. The final
image uses Node 22.23.5 and UID 10001, with the HTTP entrypoint bound to
`127.0.0.1` and `PORT=8080` by default. The container starts through
`/opt/peer/runtime.cjs`, which reads the config-CD snapshot mounted at
`/run/secrets/runtime.json`.
This file must contain `NODE_ENV` and may contain `PEER_CASH_RELAY_API_KEY`, both
strings, for example `{"NODE_ENV":"production"}`. `PORT` is forbidden in the file: Peer Deploy sets it
through container environment variables for each blue-green slot, and the wrapper
preserves that value. The service needs no application secrets, database, Redis
or persistent application volume.

The runtime mount is readable by UID 10001. The loader's fallback to container
env when the file is absent (`ENOENT`) predates config CD and is not used in
production. The wrapper logs the source without values, fails startup for other
read errors or invalid configuration, and redacts configured values of at least
16 characters from stdout and stderr.

For local checks, create `runtime.json` with the non-secret example above. On
Linux, run:

```sh
docker run --rm --network host \
  --mount "type=bind,src=$PWD/runtime.json,dst=/run/secrets/runtime.json,readonly" \
  peer-mcp:local
```

From another terminal, `curl --fail http://127.0.0.1:8080/health`. Expect HTTP 200
and a JSON body with `ok: true`, `service: peer-mcp` and `profile: read-only`.

For Docker Desktop without host networking, publish a loopback port and bind
the server to the container interface:

```sh
docker run --rm -p 127.0.0.1:8080:8080 \
  --mount "type=bind,src=$PWD/runtime.json,dst=/run/secrets/runtime.json,readonly" \
  peer-mcp:local node /opt/peer/runtime.cjs dist/cli.cjs mcp \
  --transport http --profile read-only --host 0.0.0.0
```

Host provisioning owns the `peer-mcp.service` unit, container restrictions,
Caddy routing and network isolation. Caddy forwards to loopback with a
loopback Host header to preserve MCP host validation. `/health` checks process
readiness; it does not verify every tool's upstream provider integration.

## Edge (Cloudflare)

`mcp.peer.xyz` is proxied by Cloudflare. The host's security group accepts
80/443 only from Cloudflare's ranges, plus 443 from Kohai, its one listed
internal caller, so a request to the host's public IP times out. Operator access
stays on SSM. Zones, DNS records and the WAF live in peer-infra
`stacks/cloudflare-edge`; the security group, private DNS and caller lists in
`stacks/edge-ingress/boxes.json`.

- **Caddy.** peer-infra `tools/edge-origin` (SSM document `peer-edge-origin`)
  owns the edge part of the Caddyfile. Caddy trusts only Cloudflare's ranges,
  answers 403 to a Cloudflare connection without our origin-pull client
  certificate, and writes a JSON access log to `/var/lib/caddy/logs/access.log`
  without query strings. Never hand-edit those blocks; peer-deploy's upstream
  rewrite keeps them, and the loopback Host header is unchanged.
- **Client IP.** The server never reads the caller's address and has no per-IP
  limiter, so IPv6 callers need nothing special.
- **No streams.** `/mcp` is stateless JSON (`enableJsonResponse`, no sessions)
  and `GET /mcp` answers 405, so there is no SSE stream to keep alive. Each tool
  call answers once, when it finishes. Plan for 100 seconds: Cloudflare returns
  524 if that answer has not started by its origin timeout, although the Node
  server allows 120 s (`requestTimeout` in `src/mcp/server.ts`). Nothing is
  cached.
- **Calls out.** Inside the VPC, Peer hostnames resolve to private addresses,
  so this host reaches another Peer box only when it is in that box's
  `internal_callers`. It is listed for the prod indexer only, not for Curator
  (`api.zkp2p.xyz`, used by the `quote` tool) or Pay API. Add a caller with a
  peer-infra PR to `boxes.json` and a stack apply; never open a security group
  by hand.
- **Errors.** 520–526 come from Cloudflare and mean an origin problem (526 is an
  invalid origin certificate). A WAF block is Cloudflare's own HTML block page
  ("Sorry, you have been blocked", with a Cloudflare Ray ID); it never reaches
  Caddy, so it is absent from the access log. A response from the server itself
  is JSON. Every proxied response carries `server: cloudflare`, so that header
  does not identify a block.
- **TLS.** Cloudflare serves the edge certificate and connects in Full (strict)
  mode; Caddy keeps renewing its Let's Encrypt certificate over HTTP-01 through
  Cloudflare.

## Monitoring and logs

The host health collector is owned by peer-infra `hosts/mcp/` (see
`hosts/mcp/MONITORING.md`). It reads the expected image from the rollout receipt
`/var/lib/peer-rollouts/mcp-prod/current.json`, checks the service, read-only
health, a nonempty tool catalog, public TLS and disk without pinning a version or
tool count, and publishes `Peer/McpProd` metrics. CloudWatch alarms reach Slack
through SNS and AWS Chatbot (peer-infra `stacks/alert-routing`).

`deploy/aws-health.py` in this repository is the superseded migration-era
script (it pins version `0.4.1` and reads the migration `build.json`). CI and CD
do not invoke it, and the installed collector comes from peer-infra; change the
peer-infra copy instead. Peer Deploy uses `/health` as its deployment health
gate.

Deploy output is in CloudWatch `/peer/deploy/mcp`; read application output with
`docker logs peer-mcp` from an SSM session.
