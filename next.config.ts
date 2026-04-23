import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['ssh2', 'cpu-features', 'bcrypt', 'better-sqlite3'],
  allowedDevOrigins: [
    "10.0.13.2",
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
