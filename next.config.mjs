/** @type {import('next').NextConfig} */
// Optional base path so the app can be hosted under a sub-path (e.g. /patchgpt
// on a portfolio domain). Set NEXT_PUBLIC_BASE_PATH at build time.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  basePath: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
