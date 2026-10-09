import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SCHOOL_OS_VERIFY === "1" ? ".next-codex" : ".next",
  ...(process.env.SCHOOL_OS_VERIFY === "1" ? { experimental: { cpus: 2 } } : {}),
};

export default nextConfig;
