# ArguSight

[![MIT License](https://img.shields.io/badge/license-MIT-gold.svg)](LICENSE)

**All-Seeing Infrastructure Monitoring** — a self-hosted, open-source SSH monitoring dashboard. No database required.

Monitor Linux, Windows, and MikroTik servers in real-time through a single dashboard. ArguSight connects via SSH to collect CPU, RAM, disk, process, Docker, GPU, network traffic, and hotspot metrics — all streamed live over WebSocket.

## Features

- **Multi-platform** — Linux, Windows, MikroTik RouterOS
- **Real-time monitoring** — WebSocket streaming with 2s detail polling
- **CPU & RAM charts** — time-series with 150-point ring buffer
- **Disk, process, Docker, GPU** — detailed server tabs
- **MikroTik** — traffic charts, hotspot users, domain analytics, network clients with destinations
- **No database** — JSON config files, zero external dependencies
- **SSH connection pool** — persistent connections with exponential backoff reconnect
- **Auth** — JWT-based login with bcrypt password hashing
- **Web-based setup wizard** — no CLI configuration needed
- **Responsive** — mobile-friendly with collapsible sidebar
- **Docker deployment** — multi-stage build, health checks, non-root user

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/uj-e404/argusight.git
cd argusight
```

### 2. Configure environment (optional)

```bash
cp .env.example .env
```

Default settings work out of the box. Edit `.env` to change the port or other settings.

### 3. Start

```bash
docker compose up -d
```

This pulls the pre-built image from GHCR. No build required.

**Prefer to build locally?** Use the install script:

```bash
./install.sh
```

This builds the image locally and starts the container. You can still update later with `docker compose pull`.

### 4. Open the setup wizard

Go to [http://localhost:4959](http://localhost:4959) — the setup wizard will automatically guide you through:

1. Creating your admin account
2. Adding servers via a web form (no JSON editing needed)
3. Testing SSH connections
4. Done — start monitoring!

## Updating

```bash
docker compose pull
docker compose up -d
```

Or if building from source:

```bash
git pull
./install.sh
```

## Configuration

### `config/auth.json`

Created automatically by the setup wizard. Contains bcrypt-hashed credentials and JWT secret.

To reset credentials, delete `config/auth.json` and restart:

```bash
rm config/auth.json
docker compose restart
```

The setup wizard will appear again at [http://localhost:4959](http://localhost:4959).

### `config/servers.json`

Server configurations created by the setup wizard. Can also be edited manually. Changes are picked up on restart:

```bash
docker compose restart
```

Passwords support environment variable references: `"$ENV:SSH_PASS_SERVER1"`.

Supported `type` values: `linux`, `windows`, `mikrotik`.

### SSH Keys

Mount your SSH keys directory for key-based authentication:

```yaml
# docker-compose.yml (already configured)
volumes:
  - ~/.ssh:/app/config/keys:ro
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4959` | Server port |
| `NODE_ENV` | `production` | Node environment |
| `CONFIG_PATH` | `/app/config` | Path to config directory |
| `COOKIE_SECURE` | `false` | Set to `true` behind HTTPS proxy |
| `SSH_KEY_DIR` | `~/.ssh` | Host SSH keys directory |

## Architecture

```
server.ts          HTTP + WebSocket server (custom, wraps Next.js)
lib/ssh-pool.ts    Singleton SSH connection pool
lib/metric-collector.ts  Polling engine (overview 5s, detail 2s, traffic 1s)
lib/parsers/       Platform-specific output parsers
hooks/             React hooks for WebSocket subscriptions
app/dashboard/     Dashboard pages and components
app/setup/         Setup wizard
```

## Tech Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4** + shadcn/ui
- **recharts** — time-series charts
- **ssh2** — SSH connections
- **ws** — WebSocket server
- **jose + jsonwebtoken** — JWT auth
- **bcrypt** — password hashing

## Troubleshooting

### Build fails with "failed to create UnixStream: Permission denied"

Next.js SWC compiler requires Unix domain sockets, which AppArmor may block during Docker build on some Linux systems.

**Fix**: Use `./install.sh` which handles this automatically. Or build with webpack bundler:
```bash
docker build --build-arg NEXT_BUNDLER=webpack -t ghcr.io/uj-e404/argusight:latest .
```

### Logo/icons not showing (broken images)

Static files return 500 Internal Server Error. This is a file permission issue in the Docker container.

**Fix**: Already resolved in the Dockerfile. If using an older version:
```bash
docker exec -u root argusight chmod -R a+r /app/public/
```

### Container keeps restarting

Check logs:
```bash
docker logs argusight
```

Common causes:
- `auth.json` invalid — delete it and re-run setup wizard
- `servers.json` has invalid JSON — validate with `jq . config/servers.json`
- SSH key path wrong — check `privateKeyPath` points to `/app/config/keys/your_key`

### Cannot connect to server

- Verify SSH access from host first: `ssh user@host -p port`
- Check key permissions: keys must be readable (mounted as `:ro`)
- For MikroTik: ensure SSH is enabled and user has API access
- For Windows: ensure OpenSSH Server is installed and running

### "ECONNREFUSED" or "ETIMEDOUT" for servers

- Server might be down or unreachable from Docker network
- If server is on localhost/127.0.0.1, use host IP (e.g., `192.168.1.x`) instead
- Check firewall: Docker container needs access to server SSH port

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
