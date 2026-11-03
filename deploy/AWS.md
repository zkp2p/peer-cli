# Hosted MCP on AWS

The production endpoint is `https://mcp.peer.xyz/mcp`, with health at
`https://mcp.peer.xyz/health`. The hosted server uses the read-only HTTP profile;
signing and broadcasting remain unavailable.

## Continuous deployment

Push to `releases/prod` to deploy through the Peer Deploy Platform:

1. GitHub-hosted `ubuntu-latest` runners build `deploy/Dockerfile`, which runs
   `npm ci`, `npm run check` and production dependency pruning. CI also starts
   the image and requires HTTP 200 from `http://127.0.0.1:8080/health`.
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
deployment. Key removal is disabled. Manual host rebuilds are retired; release
and rollback source changes go through this pipeline. Use the Peer Deploy
platform runbook for host-level recovery.

## Image and local verification

Build with `docker build -f deploy/Dockerfile -t peer-mcp:local .`. The final
image uses Node 22.23.4 and UID 10001, with the HTTP entrypoint bound to
`127.0.0.1` and `PORT=8080` by default. The container starts through
`/opt/peer/runtime.cjs`, which reads the host-mounted `/run/secrets/runtime.json`.
This file must contain exactly `NODE_ENV`, as a string, for example
`{"NODE_ENV":"production"}`. `PORT` is forbidden in the file: Peer Deploy sets it
through container environment variables for each blue-green slot, and the wrapper
preserves that value. The service needs no application secrets, database, Redis
or persistent application volume.

The deploy tool's one-time adoption deploy adds the read-only runtime mount,
readable by UID 10001. Until then, only an absent file (`ENOENT`) enables the
legacy fallback to `NODE_ENV` from container env, with the same validation and
redaction and `PORT` still supplied by container env. The wrapper logs the source
without values, fails startup for other read errors or invalid configuration,
and redacts configured values of at least 16 characters from stdout and stderr.

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

## Migration health monitor

`aws-health.py` is retained from the original AWS migration. It expects
owner-only `/etc/peer-mcp/health-target.json` with `region`, `accountId`,
`instanceId` and `roleName`, and the expected `imageId` in
`/var/lib/peer-mcp-migration/build.json`. It uses the EC2 instance role for
CloudWatch metrics and checks the service, image, read-only health, tool catalog
and public TLS origin.

Its version, catalog count and origin marker are migration-specific assertions;
the host's expected image and monitoring configuration must track releases.
This script is not invoked by CI or CD. Peer Deploy uses `/health` as its
deployment health gate.
