import Link from "next/link";
import { createTechnicianGroup } from "../actions";
import { prisma } from "../../lib/prisma";
import { ensureInitialData } from "../../lib/schedule";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  await ensureInitialData();

  const groups = await prisma.technicianGroup.findMany({
    include: {
      members: {
        include: { technician: true },
        orderBy: { isPrimary: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <main>
      <header className="topbar">
        <div><p className="eyebrow">Especialidades</p><h1>Grupos técnicos</h1><span className="page-hint">Os grupos poderão orientar escalas, substituições e atendimento por especialidade.</span></div>
        <div className="header-actions"><Link className="button button-secondary" href="/tecnicos">Técnicos</Link><Link className="button button-secondary" href="/">Voltar ao painel</Link></div>
      </header>

      <section className="form-panel compact-form-panel">
        <div><p className="eyebrow">Novo grupo</p><h2>Cadastrar especialidade</h2><p>Exemplos: telefonia, redes, energia ou auxílios à navegação.</p></div>
        <form action={createTechnicianGroup} className="group-create-form">
          <label>Nome do grupo<input name="name" placeholder="Ex.: Rádio" required /></label>
          <button className="button button-primary" type="submit">Criar grupo</button>
        </form>
      </section>

      <section className="group-grid">
        {groups.map((group) => {
          const members = [...group.members].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.technician.name.localeCompare(b.technician.name, "pt-BR"));
          return (
            <article className="group-card" key={group.id}>
              <header><div><span>Especialidade</span><h2>{group.name}</h2></div><strong>{members.length}</strong></header>
              <div className="group-members">
                {members.length === 0
                  ? <span className="group-empty">Nenhum técnico vinculado.</span>
                  : members.map((membership) => (
                    <Link href={`/tecnicos/${membership.technicianId}`} key={membership.technicianId}>
                      <span>{membership.technician.name}</span>
                      {membership.isPrimary && <small>Principal</small>}
                    </Link>
                  ))}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
