import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['ssh2', 'cpu-features', 'bcrypt', 'better-sqlite3'],
};

export default nextConfig;
