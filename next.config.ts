import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**": ["./data/degree-planner.sqlite"],
  },
};

export default nextConfig;
