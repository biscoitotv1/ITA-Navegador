import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ITA Navegador — Seu ponto de partida para navegar pelo ITA",
  description:
    "Navegação rápida, privada e protegida com o protetor ITA. Use no navegador ou baixe o app desktop: tema escuro, favoritos, downloads e sessão persistente.",
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
