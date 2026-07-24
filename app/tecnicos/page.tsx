import Link from "next/link";
import { createTechnician } from "../actions";
import { prisma } from "../../lib/prisma";

export const dynamic = "force-dynamic";

export default async function TechniciansPage() {
  const technicians = await prisma.technician.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { unavailabilities: true, assignments: true } } },
  });

  return (
    <main>
      <header className="topbar">
        <div><p className="eyebrow">Administração</p><h1>Técnicos</h1></div>
        <div className="header-actions"><Link className="button button-secondary" href="/">Voltar à escala</Link></div>
      </header>

      <section className="form-panel">
        <div><p className="eyebrow">Novo cadastro</p><h2>Cadastrar técnico</h2><p>A data de referência define o primeiro dia de expediente do ciclo dia sim, dia não.</p></div>
        <form action={createTechnician} className="technician-form">
          <label className="reason-field">Nome<input name="name" placeholder="Nome do técnico" required /></label>
          <label>Data-base do expediente<input type="date" name="referenceDate" required /></label>
          <label>Horas por expediente<input type="number" name="dailyHours" min="1" max="24" defaultValue="8" required /></label>
          <label className="check"><input type="checkbox" name="participatesScale" defaultChecked /> Participa da escala</label>
          <button className="button button-primary" type="submit">Cadastrar técnico</button>
        </form>
      </section>

      <section className="people-grid">
        {technicians.map((technician) => (
          <Link className="person-card" href={`/tecnicos/${technician.id}`} key={technician.id}>
            <div><strong>{technician.name}</strong><span>{technician.participatesScale ? "Escala + expediente" : "Somente expediente"}</span></div>
            <div className="person-metrics"><span>{technician._count.assignments} serviços</span><span>{technician._count.unavailabilities} indisponibilidades</span></div>
            <small>{technician.active ? "Ativo" : "Inativo"} · {technician.dailyHours}h por expediente</small>
          </Link>
        ))}
      </section>
    </main>
  );
}
