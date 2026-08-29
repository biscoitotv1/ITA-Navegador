import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ITA Navegador — Seu ponto de partida para navegar pelo ITA",
  description:
    "Navegação rápida, privada e protegida com o protetor ITA. Use no navegador ou baixe o app desktop: tema escuro, favoritos, downloads e sessão persistente.",
  icons: {
    icon: [
      { url: "/brand/ita-logo-128.png", sizes: "128x128", type: "image/png" },
      { url: "/brand/ita-logo.ico", sizes: "any" },
    ],
    apple: [{ url: "/brand/ita-logo.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0f1c",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
