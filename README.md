# Efetivo COST

Sistema em Next.js, Prisma e SQLite para planejamento operacional de técnicos.

## Funcionalidades atuais

- timeline mensal, trimestral e anual;
- escala diária de serviço de 24 horas;
- escala provisória de sobreaviso;
- expediente previsto em ciclo dia sim, dia não;
- bloqueio de expediente em fins de semana, feriados, serviço 24h, saída e descanso;
- indisponibilidades com aprovação após o bloqueio mensal;
- agenda agrupada por data;
- cadastro e ficha individual de técnicos;
- grupos de especialidade, como telefonia, redes e energia;
- projeção automática das escalas futuras;
- SQLite criado e atualizado automaticamente pelo Prisma.

## Execução

```bash
npm install
npm run dev
```

O sistema estará disponível em `http://localhost:3000`.

## Banco de dados

```bash
npm run db:studio
```

O banco local fica em `prisma/dev.db`.
