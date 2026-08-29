import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.join(process.cwd()),
  async rewrites() {
    // /app entrega a interface do ITA Navegador (public/ui/index.html)
    // /ide entrega o IDE Workspace (public/ide/index.html)
    return [
      { source: "/app", destination: "/ui/index.html" },
      { source: "/ide", destination: "/ide/index.html" },
    ];
  },
};

export default nextConfig;
