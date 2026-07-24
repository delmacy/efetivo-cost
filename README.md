# Efetivo COST

Primeira versão funcional do planejamento de escala e expediente alternado.

## Executar localmente

```bash
npm install
npm run dev
```

O comando cria automaticamente o banco SQLite em `prisma/dev.db`, prepara as tabelas e inicia o Next.js em `http://localhost:3000`.

## Funcionalidades atuais

- timeline mensal responsiva;
- expediente dia sim/dia não calculado por técnico;
- serviços de escala persistidos no SQLite;
- formulário de indisponibilidade;
- indisponibilidade pendente quando o mês está bloqueado;
- aprovação e rejeição pelo escalante;
- recálculo básico dos serviços afetados;
- incremento da versão da escala após recálculo;
- view específica para celular.

## Banco de dados

```bash
npm run db:studio
```

Abre o Prisma Studio para visualizar e editar os registros do SQLite.
