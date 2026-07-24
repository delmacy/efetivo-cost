import type { Metadata } from "next";
import { AppShell } from "./components/app-shell";
import "./globals.css";
import "./forms.css";
import "./calendar-extra.css";
import "./shell.css";
import "./list-view.css";
import "./dashboard.css";
import "./agenda.css";
import "./quick-actions.css";
import "./groups.css";

export const metadata: Metadata = {
  title: "Efetivo COST",
  description: "Planejamento de escala e expediente",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
