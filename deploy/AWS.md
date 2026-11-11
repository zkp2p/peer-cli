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

`deploy/runtime.cjs` accepts exactly `NODE_ENV`. Adding or removing a key in
Infisical makes the reconcile deploy fail its health check and roll back; change
the loader's expected key set and deploy it first, then edit Infisical.

## Image and local verification

Build with `docker build -f deploy/Dockerfile -t peer-mcp:local .`. The final
image uses Node 22.23.4 and UID 10001, with the HTTP entrypoint bound to
`127.0.0.1` and `PORT=8080` by default. The container starts through
`/opt/peer/runtime.cjs`, which reads the config-CD snapshot mounted at
`/run/secrets/runtime.json`.
This file must contain exactly `NODE_ENV`, as a string, for example
`{"NODE_ENV":"production"}`. `PORT` is forbidden in the file: Peer Deploy sets it
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
