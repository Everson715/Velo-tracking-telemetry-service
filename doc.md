# Documentação Oficial: `tracking-telemetry-service`

**Stack:** Fastify + TypeScript

## 1. Visão Geral

* **Objetivo:** Gerenciar o estado geoespacial em tempo real e a telemetria das corridas.
* **Responsabilidades:** Ingestão de coordenadas GPS via WebSockets, persistência de rastros de rotas, identificação de anomalias (telemetria de segurança) e localização de motoristas.
* **Limites do Domínio:** Lida estritamente com coordenadas, eventos físicos (acelerômetro) e sessões ativas de GPS. Não entende regras de preço ou alocação.
* **Integrações:** Recebe requisições de clientes (App Motorista/Passageiro). Fornece dados geoespaciais assíncronos e síncronos para o `trip-matching-service`.

## 2. Requisitos Funcionais (RF)

* **RF-001 (Transmissão de Posição do Motorista):** O sistema deve aceitar coordenadas de GPS a cada 3-5 segundos via WebSocket. *(Endpoint: WS /tracking/stream/driver)* | **Prioridade:** Alta
* **RF-002 (Recepção de Posição pelo Passageiro):** O sistema deve transmitir a posição em tempo real do motorista alocado para o passageiro. *(Endpoint: WS /tracking/stream/passenger)* | **Prioridade:** Alta
* **RF-003 (Atualização de Posição de Backup):** O sistema deve permitir atualizações geoespaciais via REST em caso de queda do WebSocket. *(Endpoint: POST /tracking/update-position)* | **Prioridade:** Alta
* **RF-004 (Busca de Motoristas Próximos):** O sistema deve retornar motoristas disponíveis em um raio específico. *(Endpoint: GET /tracking/drivers/nearby)* | **Prioridade:** Média
* **RF-005 (Consulta de Última Coordenada):** O sistema deve retornar a localização mais recente de uma corrida específica. *(Endpoint: GET /tracking/trip/{trip_id}/current)* | **Prioridade:** Média
* **RF-006 (Registro de Eventos de Telemetria):** O sistema deve registrar eventos de condução perigosa detectados pelos sensores do dispositivo. *(Endpoint: POST /tracking/events)* | **Prioridade:** Baixa
* **RF-007 (Histórico Geoespacial):** O sistema deve retornar os breadcrumbs percorridos em uma viagem. *(Endpoint: GET /tracking/history/{trip_id})* | **Prioridade:** Média

## 3. Requisitos Não Funcionais (RNF)

* **RNF-001 (Performance/WebSocket):** O servidor Fastify deve suportar conexões persistentes de alta taxa de transferência (throughput) minimizando overhead.
* **RNF-002 (Resiliência):** O sistema deve tolerar desconexões abruptas de WebSocket e possuir mecanismos de reconexão ou fallback para chamadas REST.
* **RNF-003 (Escalabilidade):** O serviço deve escalar horizontalmente; conexões WebSocket devem ser gerenciadas via adaptadores (ex: Redis Pub/Sub) para ambientes clusterizados.
* **RNF-004 (Observabilidade):** Implementar tracing distribuído para rastrear latência na ingestão de posições.

## 4. Regras de Negócio

* **RN-001:** O payload de coordenadas recebido não deve ser processado se o timestamp for mais antigo que o estado atual registrado (prevenção de desordem temporal).
* **RN-002:** Eventos de telemetria só podem ser registrados se estiverem associados a um `trip_id` em andamento.
* **RN-003:** A visualização do `stream/passenger` só é permitida se a corrida correspondente não estiver concluída ou cancelada.

## 5. Casos de Uso

* **CU-001:** Rastreamento Contínuo
* **Atores:** Motorista
* **Pré-condições:** Estar autenticado e com viagem ativa.
* **Fluxo Principal:** O App abre conexão WebSocket; envia lat/lng a cada 3s; o servidor Fastify persiste em memória/cache e enfileira para banco.
* **Pós-condições:** Coordenadas atualizadas no serviço.



## 6. Modelagem de Dados (PostgreSQL)

* **Tabela `trip_breadcrumbs**`
* `id` (UUID, PK)
* `trip_id` (UUID, Index)
* `latitude` (DECIMAL/FLOAT)
* `longitude` (DECIMAL/FLOAT)
* `recorded_at` (TIMESTAMP)


* **Tabela `telemetry_events**`
* `id` (UUID, PK)
* `trip_id` (UUID)
* `event_type` (VARCHAR - HARD_BRAKE, RAPID_ACCEL)
* `latitude`, `longitude` (DECIMAL)
* `created_at` (TIMESTAMP)



## 7. API REST & WebSocket

* **WS /tracking/stream/driver** | **Payload:** `{ lat, lng, heading, timestamp }` | **Auth:** Token Motorista
* **WS /tracking/stream/passenger** | **Payload:** `{ trip_id }` | **Auth:** Token Passageiro
* **POST /tracking/update-position** | **Payload In:** `{ lat, lng }` | **Saída:** `200 OK`
* **GET /tracking/drivers/nearby** | **Query:** `?lat=&lng=&radius=` | **Saída:** `[{ driver_id, lat, lng }]`
* **GET /tracking/trip/{trip_id}/current** | **Saída:** `{ lat, lng, last_updated }`
* **POST /tracking/events** | **Payload In:** `{ trip_id, event_type }` | **Saída:** `201 Created`
* **GET /tracking/history/{trip_id}** | **Saída:** `[{ lat, lng, timestamp }]`

## 8. Fluxos de Estados

* **Estado da Sessão WS:** `DISCONNECTED` → `CONNECTING` → `CONNECTED` → `AUTHENTICATED` → `STREAMING` → `DISCONNECTED`

## 9. Segurança & 10. Observabilidade

* **Segurança:** Autenticação no handshake do WebSocket (Passagem de token JWT via query string ou auth ticket). Proteção de IDOR: Passageiros só podem ver o histórico da sua própria `trip_id`.
* **Observabilidade:** Logs estruturados em formato JSON no Fastify para todos os eventos de desconexão de socket. Health Check (`/health`) crítico para roteamento do Nginx.

## 11. Testes

* **Testes Unitários:** Validação das lógicas de tolerância de coordenadas (ex: rejeição de saltos irreais de GPS).
* **Testes de Integração:** Simulação de conexões WS simultâneas usando mock do JWT. Validação `InputValidationTest` para lat/lng inválidos (ex: lat > 90).

## 12. Telas do Sistema

* **Tela:** Mapa de Navegação da Viagem
* **Objetivo:** Exibir a rota da viagem e posição do motorista em tempo real.
* **Componentes:** Renderizador de mapa (Mapbox/Google Maps), pino do motorista, polilinha da rota.
* **Comportamento:** Ocupa toda a tela, reage passivamente via WebSocket (`/tracking/stream/passenger`).
* **Wireframe:** `[ Header: Detalhes da Corrida ] [ Corpo: Mapa preenchendo a tela com pino animado ] [ Footer: Placa do carro / Cancelar ]`



## 13. Critérios de Aceitação

* **Dado** que o motorista está offline no banco, **Quando** o endpoint `/tracking/drivers/nearby` é chamado, **Então** ele não deve ser listado no retorno.
