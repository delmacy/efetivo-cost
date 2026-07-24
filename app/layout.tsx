import type { Metadata } from "next";
import "./globals.css";
import "./forms.css";
import "./calendar-extra.css";

export const metadata: Metadata = {
  title: "Efetivo COST",
  description: "Planejamento de escala e expediente",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
