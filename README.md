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

### 2. Configure servers

```bash
cp config/servers.example.json config/servers.json
```

Edit `config/servers.json` with your server details:

```json
{
  "servers": [
    {
      "id": "unique-id",
      "name": "My Server",
      "host": "192.168.1.1",
      "port": 22,
      "username": "root",
      "authType": "password",
      "password": "secret",
      "type": "linux",
      "features": ["cpu", "ram", "disk", "processes", "docker"]
    }
  ]
}
```

Passwords support environment variable references: `"$ENV:SSH_PASS_SERVER1"`.

Supported `type` values: `linux`, `windows`, `mikrotik`.

### 3. Build and start

```bash
docker compose up -d --build
```

### 4. Set up authentication

```bash
docker compose exec argusight node --import tsx scripts/setup.ts
```

This will prompt you to create an admin username and password.

### 5. Open the dashboard

Go to [http://localhost:4959](http://localhost:4959) and log in with your credentials.

## Updating

```bash
git pull
docker compose up -d --build
```

## Configuration

### `config/auth.json`

Created by the setup command. Contains bcrypt-hashed credentials and JWT secret.

To reset credentials:

```bash
docker compose exec argusight node --import tsx scripts/setup.ts
```

### `config/servers.json`

Array of server configurations. Changes are picked up on restart:

```bash
docker compose restart
```

### SSH Keys

Mount your SSH keys directory for key-based authentication:

```yaml
# docker-compose.yml (already configured)
volumes:
  - ~/.ssh:/app/config/keys:ro
```

## Architecture

```
server.ts          HTTP + WebSocket server (custom, wraps Next.js)
lib/ssh-pool.ts    Singleton SSH connection pool
lib/metric-collector.ts  Polling engine (overview 5s, detail 2s, traffic 1s)
lib/parsers/       Platform-specific output parsers
hooks/             React hooks for WebSocket subscriptions
app/dashboard/     Dashboard pages and components
```

## Tech Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4** + shadcn/ui
- **recharts** — time-series charts
- **ssh2** — SSH connections
- **ws** — WebSocket server
- **jose + jsonwebtoken** — JWT auth
- **bcrypt** — password hashing

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
