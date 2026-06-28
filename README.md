# Velo Tracking & Telemetry Service

Microsserviço de rastreamento geoespacial em tempo real e telemetria de segurança para a plataforma Velo.

## Stack

- **Runtime:** Node.js 20 + TypeScript
- **Framework:** Fastify 5
- **Banco:** PostgreSQL 16 (database-per-service)
- **Cache/Pub-Sub:** Redis 7 (posições em tempo real + broadcast clusterizado)
- **Auth:** JWT (claims: `sub`, `iss`, `aud`, `exp`, `roles`)

## Arquitetura em Camadas

```
src/
├── application/     # Rotas REST, WebSockets, schemas de entrada
├── domain/          # Regras de negócio (RN-001..003), serviços puros
├── infrastructure/  # PostgreSQL, Redis, autenticação
└── config/          # Variáveis de ambiente
```

## Endpoints

| Método | Rota | Descrição | Auth |
|--------|------|-----------|------|
| WS | `/tracking/stream/driver` | Ingestão GPS contínua (3-5s) | Driver JWT |
| WS | `/tracking/stream/passenger?trip_id=` | Stream da posição do motorista | Passenger JWT |
| POST | `/tracking/update-position` | Fallback REST quando WS cai | Driver JWT |
| GET | `/tracking/drivers/nearby?lat=&lng=&radius=` | Motoristas online no raio | Passenger/Admin |
| GET | `/tracking/trip/:trip_id/current` | Última coordenada da corrida | Passenger/Driver/Admin |
| POST | `/tracking/events` | Eventos HARD_BRAKE / RAPID_ACCEL | Driver JWT |
| GET | `/tracking/history/:trip_id` | Breadcrumbs da viagem | Passenger/Driver/Admin |
| GET | `/health` | Health check (Nginx/K8s) | Público |
| POST | `/internal/trips` | Registro de corrida (trip-matching) | Admin JWT |
| PATCH | `/internal/trips/:trip_id/status` | Atualização de status | Admin JWT |

## Regras de Negócio Implementadas

- **RN-001:** Coordenadas com timestamp anterior ao estado atual são rejeitadas.
- **RN-002:** Eventos de telemetria exigem `trip_id` com status `ACTIVE`.
- **RN-003:** Stream do passageiro bloqueado para viagens `COMPLETED` ou `CANCELLED`.
- **IDOR:** Passageiros só acessam histórico/posição de viagens próprias.

## Execução Local

```bash
# 1. Subir infraestrutura
docker compose up -d

# 2. Instalar dependências e migrar
npm install
cp .env.example .env
npm run migrate

# 3. Desenvolvimento
npm run dev
```

## Testes

```bash
npm test
```

## Gerar Token de Demo

```bash
npx tsx scripts/generate-token.ts driver 00000000-0000-4000-8000-000000000001
npx tsx scripts/generate-token.ts passenger 00000000-0000-4000-8000-000000000002
npx tsx scripts/generate-token.ts admin 00000000-0000-4000-8000-000000000099
```

## Exemplo de Fluxo

```bash
# Registrar viagem (admin token)
curl -X POST http://localhost:3003/internal/trips \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"trip_id":"11111111-1111-4111-8111-111111111111","driver_id":"00000000-0000-4000-8000-000000000001","passenger_id":"00000000-0000-4000-8000-000000000002"}'

# Atualizar posição via REST (fallback)
curl -X POST http://localhost:3003/tracking/update-position \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"lat":-23.5505,"lng":-46.6333}'

# Consultar motoristas próximos
curl "http://localhost:3003/tracking/drivers/nearby?lat=-23.55&lng=-46.63&radius=5000" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

## Integração com API Gateway

O gateway deve rotear `/tracking/*` para este serviço na porta `3003`, repassando o header `Authorization: Bearer <JWT>` emitido pelo IdP centralizado.

## Modelo de Dados

- `trip_breadcrumbs` — histórico geoespacial por viagem
- `telemetry_events` — eventos de condução perigosa
- `trip_contexts` — contexto local de viagens (autonomia do microsserviço)
