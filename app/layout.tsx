import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "ITA Navegador — Seu ponto de partida para navegar pelo ITA",
  description:
    "Navegação rápida, privada e protegida com o protetor ITA. Use no navegador ou baixe o app desktop: tema escuro, favoritos, downloads e sessão persistente.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/brand/ita-logo-128.png", sizes: "128x128", type: "image/png" },
      { url: "/brand/ita-logo.ico", sizes: "any" },
    ],
    apple: [{ url: "/brand/ita-logo.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        {/* Tipografia: fontes auto-hospedadas (funcionam offline) */}
        <link rel="preload" href="/fonts/Inter.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/PlusJakartaSans.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="stylesheet" href="/fonts/fonts.css" />
        {children}
        {/* PWA: registra o Service Worker só no site (HTTPS); no
            Electron/localhost é ignorado de propósito. */}
        <Script id="ita-sw-register" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator && location.protocol === 'https:') { window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); }); }`}
        </Script>
      </body>
    </html>
  );
}
