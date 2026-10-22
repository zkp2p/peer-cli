# Hosted MCP on AWS

The production hostname is `https://mcp.peer.xyz/mcp`. The hosted server keeps
the read-only HTTP profile; signing and broadcasting remain unavailable.
The migration used application source `336475fa544bcfe0b04457d22578e6525b6614dc`
and passed the repository's full check, including 236 tests.

## Package and operate

Build with `docker build -f deploy/Dockerfile .`. The final image uses Node
22.23.4, UID 10001 and the existing HTTP entrypoint. The service has no configured
application secrets, database, Redis or persistent application volume.

Use the team's private deployment manifest to select the AWS account, instance,
immutable image and recovery archive. Do not put those host coordinates or any
operator credentials in this repository.

The production container is named `peer-mcp` and controlled by
`peer-mcp.service`. It uses host networking with the application bound to
127.0.0.1:8080, a read-only filesystem, dropped capabilities, a bounded `/tmp`,
512 MiB memory and 128 PIDs. Only the TLS edge is publicly reachable. Caddy
forwards to loopback and sets the upstream Host header to `127.0.0.1:8080`,
preserving the MCP library's host validation. Network rules block the
application UID from EC2 metadata and Caddy's local administration port.

Install `aws-health.py` at `/opt/peer-mcp/aws-health.py` and render root-owned
mode-0600 `/etc/peer-mcp/health-target.json` with `region`, `accountId`,
`instanceId` and `roleName` from the verified private target. Save the expected
image ID as `imageId` in `/var/lib/peer-mcp-migration/build.json`. The check
asserts the active instance role and verifies process, image, read-only health,
tool catalog and the public TLS origin. Its instance role needs narrowly scoped
CloudWatch metric access.

The current setup has a minute health timer, six alarms and daily encrypted root
snapshots. The shared SNS topic has no confirmed subscriber; alarm delivery
remains an explicit follow-up. The exact image's versioned S3 download, SHA-256
and Docker load have been verified. VM snapshots are not a substitute for an
immutable application archive.

## Release and rollback

1. Run `npm run check` on the intended source and build an immutable image.
2. Verify the AWS identity and preserve a recoverable image before changing traffic.
3. Start a candidate on an isolated loopback port. Test TLS through the edge,
   MCP initialization, exact tool catalog parity and a harmless blockchain read.
4. Switch the edge only after checks pass; repeat them at the production hostname.
5. On failure, restore the prior verified AWS image and edge route. Do not
   introduce a signing key or expand the hosted profile as a workaround.

During the initial migration, DNS changed only after a separate AWS hostname
passed these checks. The documented legacy `peer-cli-production.up.railway.app`
address remains a compatibility endpoint pending retirement. Its presence is
separate from the production custom hostname's successful AWS cutover. New
integrations must use `mcp.peer.xyz`; the `llms.txt` reference is corrected here.

The source deployment already returned `API_ERROR` for
`peer_market_meta_platforms` without configured provider authentication. This
migration does not claim that every listed tool's upstream flow works; catalog
parity and a real blockchain read were checked separately.
