"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navigation = [
  { href: "/", label: "Painel", icon: "▦" },
  { href: "/tecnicos", label: "Técnicos", icon: "👥" },
  { href: "/grupos", label: "Grupos", icon: "#" },
  { href: "/#pendencias", label: "Pendências", icon: "!" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href.startsWith("/#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="app-shell">
      <button className="mobile-menu-button" type="button" onClick={() => setOpen(true)} aria-label="Abrir menu">
        <span />
        <span />
        <span />
      </button>

      {open && <button className="sidebar-backdrop" type="button" aria-label="Fechar menu" onClick={() => setOpen(false)} />}

      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">EC</div>
          <div>
            <strong>Efetivo COST</strong>
            <span>Planejamento operacional</span>
          </div>
          <button className="sidebar-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar menu">×</button>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          <p>Navegação</p>
          {navigation.map((item) => (
            <Link
              href={item.href}
              key={item.href}
              className={`sidebar-link ${isActive(pathname, item.href) ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-help">
          <span className="sidebar-help-icon">i</span>
          <div>
            <strong>Escala viva</strong>
            <small>24h, sobreaviso, expediente e especialidades.</small>
          </div>
        </div>
      </aside>

      <div className="app-content">{children}</div>
    </div>
  );
}
