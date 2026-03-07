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
- **Docker-ready** — multi-stage build, health checks, non-root user

## Quick Start

### With pnpm

```bash
# Install dependencies
pnpm install

# Set up authentication (interactive)
pnpm init-auth

# Configure servers
cp config/servers.example.json config/servers.json
# Edit config/servers.json with your server details

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and log in.

### With Docker

```bash
# Set up auth first
pnpm install && pnpm init-auth

# Configure servers
cp config/servers.example.json config/servers.json

# Build and run
docker compose up -d
```

Open [http://localhost:4959](http://localhost:4959).

## Configuration

### `config/auth.json`

Created by `pnpm init-auth`. Contains bcrypt-hashed credentials and JWT secret.

### `config/servers.json`

Array of server configurations:

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

## Architecture

```
server.ts          HTTP + WebSocket server (custom, wraps Next.js)
lib/ssh-pool.ts    Singleton SSH connection pool
lib/metric-collector.ts  Polling engine (overview 5s, detail 2s, traffic 1s)
lib/parsers/       Platform-specific output parsers
hooks/             React hooks for WebSocket subscriptions
app/dashboard/     Dashboard pages and components
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server (port 3000) |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm init-auth` | Interactive auth setup |
| `pnpm hash-password` | Hash a password (CLI utility) |

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
