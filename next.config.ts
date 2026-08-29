import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.join(process.cwd()),
  async rewrites() {
    // /app entrega a interface do ITA Navegador (public/ui/index.html)
    // /ui é o caminho limpo para a mesma interface (usado pela landing e pelo manifest)
    // /ide entrega o IDE Workspace (public/ide/index.html)
    return [
      { source: "/app", destination: "/ui/index.html" },
      { source: "/ui", destination: "/ui/index.html" },
      { source: "/ide", destination: "/ide/index.html" },
    ];
  },
};

export default nextConfig;
