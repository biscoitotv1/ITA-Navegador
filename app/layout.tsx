import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ITA Navegador",
  description: "Navegação e informações do ITA.",
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
