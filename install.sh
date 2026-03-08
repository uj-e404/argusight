#!/bin/bash
# install.sh - One-click ArguSight installer

set -e

echo ""
echo "╔══════════════════════════════════╗"
echo "║       ArguSight Installer        ║"
echo "╚══════════════════════════════════╝"
echo ""

# Check Docker
if ! command -v docker &>/dev/null; then
  echo "ERROR: Docker is not installed."
  echo "Install from https://docs.docker.com/get-docker/"
  exit 1
fi

# Check Docker Compose
if ! docker compose version &>/dev/null; then
  echo "ERROR: Docker Compose is not available."
  echo "Install from https://docs.docker.com/compose/install/"
  exit 1
fi

# Copy .env if not exists
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
  fi
fi

echo "Building ArguSight image (this may take a few minutes)..."
echo ""

docker build -t argusight:latest .

echo ""
echo "Build complete!"

# Update docker-compose to use locally built image instead of GHCR
sed -i 's|image: ghcr.io/uj-e404/argusight:latest|image: argusight:latest|' docker-compose.yml
echo "Updated docker-compose.yml to use local image"

# Start the container
echo "Starting ArguSight..."
docker compose up -d

PORT="${PORT:-4959}"

echo ""
echo "════════════════════════════════════"
echo "  ArguSight is running!"
echo ""
echo "  Open http://localhost:${PORT}"
echo "  The setup wizard will guide you"
echo "  through initial configuration."
echo "════════════════════════════════════"
echo ""
