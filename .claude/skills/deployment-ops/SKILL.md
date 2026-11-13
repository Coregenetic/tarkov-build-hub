---
name: deployment-ops
description: Prepare, configure, deploy, and maintain the Tarkov build-sharing website on a Linux server behind Caddy, with safe environment and rollback practices.
---

# Deployment and Operations

## First inspect
- Inspect the current server, running services, ports, Caddy configuration, DNS, and existing deployments before changing anything.
- Do not overwrite or restart unrelated Caddy instances or sites.
- Do not assume ports are free. Check before binding.
- Prefer an isolated app directory, dedicated service/container, and explicit environment file.

## Deployment
- Provide reproducible build and start commands.
- Use HTTPS through the existing reverse-proxy setup only after reviewing its current configuration.
- Keep secrets outside the repository.
- Add health checks, structured logs, restart policy, and database backup instructions.
- Document DNS, required ports, environment variables, and rollback steps.
- Make deployment idempotent and avoid destructive commands.

## Handoff
Provide a concise deployment runbook, update procedure, backup/restore procedure, and troubleshooting guide. Never claim deployment succeeded until verified.
