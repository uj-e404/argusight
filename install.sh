#!/bin/bash
# install.sh - One-click ArguSight installer
# Handles AppArmor restrictions automatically when building from source.

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

# Detect if AppArmor is active and may block the build
if docker info 2>/dev/null | grep -q "apparmor"; then
  echo "AppArmor detected — using buildx with insecure entitlement..."
  echo ""

  BUILDER_NAME="argusight-builder"

  # Create a builder that allows insecure entitlements
  docker buildx create --name "$BUILDER_NAME" \
    --driver docker-container \
    --buildkitd-flags '--allow-insecure-entitlement security.insecure' \
    2>/dev/null || true

  docker buildx build \
    --builder "$BUILDER_NAME" \
    --allow security.insecure \
    --load \
    -t argusight:latest .

  # Clean up builder
  docker buildx rm "$BUILDER_NAME" 2>/dev/null || true

  echo ""
  echo "Build complete! Starting container..."
else
  echo "Building normally..."
  docker compose build
  echo ""
  echo "Build complete! Starting container..."
fi

# Start the container
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
