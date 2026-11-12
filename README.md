# Agentic Poker

Jogo de Texas Hold'em No-Limit com fichas virtuais, construído com microsserviços,
componentes de software reutilizáveis e agentes de IA.

## Como rodar

Requisitos: Node.js 24, pnpm 9 e Docker (para o Postgres).

```bash
pnpm install
pnpm db:up      # sobe o Postgres em Docker (porta 5433)
pnpm dev
```

Abra http://localhost:5173, crie uma conta (e-mail, apelido e senha), sente em uma mesa e
clique em **+ Bot** para jogar contra bots. Para jogar com outra pessoa, abra uma janela
anônima e crie outra conta. `pnpm db:down` para o banco; os dados ficam num volume do Docker.

Modo produção (o jogo e a interface em http://localhost:3001, mais os serviços auth e de agentes):

```bash
pnpm build
pnpm start
```

| Variável                  | Padrão                                        | Para quê                                                                             |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GAME_ENGINE_PORT`        | `3001`                                        | Porta do servidor do jogo                                                            |
| `AGENT_ORCHESTRATOR_PORT` | `3002`                                        | Porta do orquestrador (só em 127.0.0.1)                                              |
| `AGENT_ORCHESTRATOR_URL`  | `http://127.0.0.1:3002`                       | Onde o jogo encontra o orquestrador                                                  |
| `ANTHROPIC_API_KEY`       | —                                             | Ativa o agente de IA do Coach (Claude)                                               |
| `COACH_MODELO`            | `claude-opus-5-5`                             | Modelo usado pelo agente                                                             |
| `COACH_IA`                | —                                             | `desligado` força o coach por regras                                                 |
| `DATABASE_URL`            | `postgres://poker:poker@127.0.0.1:5433/poker` | Postgres das contas                                                                  |
| `AUTH_PORT`               | `3003`                                        | Porta do serviço auth (só em 127.0.0.1)                                              |
| `AUTH_URL`                | `http://127.0.0.1:3003`                       | Onde o jogo encontra o serviço auth                                                  |
| `AUTH_SEGREDO`            | segredo de desenvolvimento                    | Assina a sessão; obrigatório em produção (32+ caracteres, o mesmo no auth e no jogo) |
| `AUTH_COOKIE_SEGURO`      | —                                             | `1` para só enviar o cookie por HTTPS                                                |

## Contas

O serviço **auth** guarda as contas no Postgres (senha com hash scrypt) e, no login ou no
cadastro, grava um cookie `httpOnly` com um token de sessão assinado, válido por 7 dias. O
**game-engine** só aceita o WebSocket de quem tem esse cookie válido, e o apelido na mesa
vem da conta. Rotas: `POST /api/auth/cadastro`, `POST /api/auth/login`,
`POST /api/auth/logout` e `GET /api/auth/eu`.

## Coach IA

Na sua vez, o painel **Coach IA** analisa a jogada usando só o que você vê:

1. **Números na hora** (sem IA): equity por simulação Monte Carlo, pot odds, chance de
   terminar com cada tipo de mão e uma avaliação de cada jogada possível.
2. **Recomendação do agente**: com `ANTHROPIC_API_KEY` definida, um agente Claude decide
   quais ferramentas usar (equity, possibilidades), interpreta os números e explica a
   jogada. Sem a chave, ou se a IA falhar, um coach por regras responde no lugar.

Marque **Automático** para receber a análise a cada decisão.

## Verificações

```bash
pnpm check
```

Roda formatação, lint, checagem de tipos e todos os testes (os mesmos passos da CI).

## Estrutura

```
packages/                 componentes de software (bibliotecas)
  shared-types/           tipos do domínio e protocolo cliente ↔ servidor
  deck/                   baralho com embaralhamento criptográfico (Fisher-Yates)
  hand-evaluator/         avaliador de mãos (5 a 7 cartas)
  action-validator/       regras de apostas do No-Limit
  equity/                 calculadora de equity por simulação Monte Carlo
  sessao/                 token de sessão assinado (emitido pelo auth, conferido pelo jogo)
services/
  auth/                   contas de jogador: cadastro, login e sessão (Postgres)
  game-engine/            microsserviço autoritativo do jogo
    src/motor/            máquina de estados da mão (funções puras)
    src/mesa/             mesa ao vivo: assentos, tempo, bots, visão por jogador
    src/bots/             bot simples por regras (provisório)
    src/servidor/         Socket.IO, lobby, ponte para o coach e arquivos estáticos
  agent-orchestrator/     microsserviço dos agentes de IA (Coach IA)
apps/
  web/                    cliente React + Vite
```
