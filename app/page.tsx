type DayStatus = "office" | "duty" | "unavailable" | "compensation" | "pending" | "off";

type Technician = {
  name: string;
  role: string;
  monthlyHours: number;
  dutyCount: number;
  days: Record<number, DayStatus[]>;
};

const days = Array.from({ length: 31 }, (_, index) => index + 1);

const technicians: Technician[] = [
  {
    name: "Técnico A",
    role: "Escala + expediente",
    monthlyHours: 168,
    dutyCount: 4,
    days: {
      1: ["office"], 2: ["off"], 3: ["office"], 4: ["duty"], 5: ["office"],
      6: ["off"], 7: ["office"], 8: ["off"], 9: ["office"], 10: ["duty"],
      11: ["office"], 12: ["off"], 13: ["office"], 14: ["off"], 15: ["office"],
      16: ["duty"], 17: ["compensation"], 18: ["off"], 19: ["office"], 20: ["off"],
      21: ["office"], 22: ["duty"], 23: ["office"], 24: ["off"], 25: ["office"],
      26: ["off"], 27: ["office"], 28: ["off"], 29: ["office"], 30: ["off"], 31: ["office"]
    },
  },
  {
    name: "Técnico B",
    role: "Escala + expediente",
    monthlyHours: 160,
    dutyCount: 3,
    days: {
      1: ["off"], 2: ["office"], 3: ["off"], 4: ["office"], 5: ["duty"],
      6: ["office"], 7: ["off"], 8: ["office"], 9: ["off"], 10: ["office"],
      11: ["duty"], 12: ["office"], 13: ["off"], 14: ["office"], 15: ["pending"],
      16: ["unavailable"], 17: ["unavailable"], 18: ["unavailable"], 19: ["office"], 20: ["off"],
      21: ["office"], 22: ["off"], 23: ["office"], 24: ["duty"], 25: ["office"],
      26: ["off"], 27: ["office"], 28: ["off"], 29: ["office"], 30: ["off"], 31: ["office"]
    },
  },
  {
    name: "Técnico C",
    role: "Escala + expediente",
    monthlyHours: 152,
    dutyCount: 3,
    days: {
      1: ["office"], 2: ["off"], 3: ["duty"], 4: ["off"], 5: ["office"],
      6: ["off"], 7: ["office"], 8: ["duty"], 9: ["office"], 10: ["off"],
      11: ["office"], 12: ["off"], 13: ["office"], 14: ["off"], 15: ["office"],
      16: ["off"], 17: ["office"], 18: ["duty"], 19: ["office"], 20: ["off"],
      21: ["office"], 22: ["off"], 23: ["office"], 24: ["off"], 25: ["office"],
      26: ["off"], 27: ["office"], 28: ["off"], 29: ["office"], 30: ["off"], 31: ["office"]
    },
  },
  {
    name: "Técnico D",
    role: "Expediente",
    monthlyHours: 144,
    dutyCount: 0,
    days: {
      1: ["office"], 2: ["off"], 3: ["office"], 4: ["off"], 5: ["office"],
      6: ["off"], 7: ["office"], 8: ["off"], 9: ["office"], 10: ["off"],
      11: ["office"], 12: ["off"], 13: ["office"], 14: ["off"], 15: ["office"],
      16: ["off"], 17: ["office"], 18: ["off"], 19: ["office"], 20: ["off"],
      21: ["office"], 22: ["off"], 23: ["office"], 24: ["off"], 25: ["office"],
      26: ["off"], 27: ["office"], 28: ["off"], 29: ["office"], 30: ["off"], 31: ["office"]
    },
  },
];

const statusLabel: Record<DayStatus, string> = {
  office: "Expediente",
  duty: "Serviço",
  unavailable: "Indisponível",
  compensation: "Compensação",
  pending: "Pendente",
  off: "Folga",
};

function StatusMark({ status }: { status: DayStatus }) {
  return <span className={`status status-${status}`} title={statusLabel[status]}>{statusLabel[status][0]}</span>;
}

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">Planejamento operacional</p>
          <h1>Efetivo COST</h1>
        </div>
        <div className="header-actions">
          <button className="button button-secondary">Pendências <strong>1</strong></button>
          <button className="button button-primary">Nova indisponibilidade</button>
        </div>
      </header>

      <section className="summary-grid">
        <article className="summary-card"><span>Mês exibido</span><strong>Julho de 2026</strong><small>Escala bloqueada</small></article>
        <article className="summary-card"><span>Participantes da escala</span><strong>3 técnicos</strong><small>10 serviços previstos</small></article>
        <article className="summary-card"><span>Indisponibilidades</span><strong>1 pendente</strong><small>Afeta o dia 15</small></article>
        <article className="summary-card"><span>Menor carga atual</span><strong>Técnico C</strong><small>152 horas computadas</small></article>
      </section>

      <section className="toolbar">
        <div className="segmented"><button>Hoje</button><button className="active">Mês</button><button>Trimestre</button><button>Ano</button></div>
        <div className="segmented"><button>Escala</button><button>Expediente</button><button className="active">Combinado</button></div>
      </section>

      <section className="desktop-timeline" aria-label="Timeline mensal da equipe">
        <div className="timeline-scroll">
          <div className="timeline-grid timeline-header">
            <div className="technician-heading">Técnico</div>
            {days.map((day) => <div className={`day-heading ${day === 24 ? "today" : ""}`} key={day}><span>{day}</span><small>{["Q", "Q", "S", "S", "D", "S", "T"][day % 7]}</small></div>)}
          </div>
          {technicians.map((technician) => (
            <div className="timeline-grid timeline-row" key={technician.name}>
              <div className="technician-cell"><strong>{technician.name}</strong><span>{technician.role}</span><small>{technician.monthlyHours}h · {technician.dutyCount} serviços</small></div>
              {days.map((day) => (
                <div className={`day-cell ${day === 24 ? "today" : ""}`} key={day}>
                  {(technician.days[day] ?? ["off"]).map((status, index) => <StatusMark key={`${status}-${index}`} status={status} />)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="mobile-view">
        <div className="mobile-date"><button>‹</button><div><span>sexta-feira</span><strong>24 de julho</strong></div><button>›</button></div>
        <div className="mobile-list">
          {technicians.map((technician) => {
            const statuses = technician.days[24] ?? ["off"];
            return (
              <article className="technician-card" key={technician.name}>
                <div><strong>{technician.name}</strong><span>{technician.role}</span></div>
                <div className="mobile-statuses">{statuses.map((status, index) => <span className={`pill pill-${status}`} key={`${status}-${index}`}>{statusLabel[status]}</span>)}</div>
                <footer><span>{technician.monthlyHours}h no mês</span><span>{technician.dutyCount} serviços</span></footer>
              </article>
            );
          })}
        </div>
      </section>

      <section className="pending-panel">
        <div>
          <p className="eyebrow">Ação necessária</p>
          <h2>Indisponibilidade em mês bloqueado</h2>
          <p>O Técnico B informou indisponibilidade entre 15 e 18 de julho. O dia 15 possui impacto na escala oficial.</p>
        </div>
        <div className="suggestion"><span>Sugestão de substituição</span><strong>Técnico C</strong><small>Menor carga mensal e sem conflito impeditivo.</small></div>
        <div className="pending-actions"><button className="button button-secondary">Analisar</button><button className="button button-primary">Aprovar e recalcular</button></div>
      </section>
    </main>
  );
}
