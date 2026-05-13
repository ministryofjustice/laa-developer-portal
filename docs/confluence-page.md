# LAA Developer Portal – Confluence Documentation

---

## Table of Contents

1. [Overview](#overview)
2. [Purpose & Scope](#purpose--scope)
3. [Technical Stack & Versions](#technical-stack--versions)
4. [System Architecture](#system-architecture)
5. [Application Layers](#application-layers)
   - [Entry Point & Bootstrap](#entry-point--bootstrap)
   - [Middleware Chain](#middleware-chain)
   - [Route Handlers](#route-handlers)
   - [Service Layer](#service-layer)
   - [Data Access Layer](#data-access-layer)
6. [External Integrations](#external-integrations)
7. [Data Storage (Redis)](#data-storage-redis)
8. [Frontend Architecture](#frontend-architecture)
9. [Security Architecture](#security-architecture)
10. [Deployment & Infrastructure](#deployment--infrastructure)
11. [Monitoring & Observability](#monitoring--observability)
12. [Developer Workflows](#developer-workflows)
13. [Testing Strategy](#testing-strategy)
14. [Environment Variables Reference](#environment-variables-reference)
15. [Key Data Models](#key-data-models)

---

## Overview

**laa-developer-portal** is the Ministry of Justice LAA (Her Majesty's Prison and Probation Service) Developer Portal. It provides LAA engineering teams with a unified, self-service view of all products, components, environments, teams, service areas, dependency health, deployment drift, security scans, and operational alerts across the LAA digital estate.

- **Repository**: `github.com/ministryofjustice/laa-developer-portal`
- **Product ID**: DPS000
- **License**: MIT
- **Version**: 0.0.1

---

## Purpose & Scope

The portal aggregates data from the **Service Catalogue (Strapi CMS)** and **Prometheus Alertmanager** to give developers and delivery managers a single pane of glass covering:

| Capability | Description |
|---|---|
| Product catalogue | Browse and inspect all LAA products with team ownership |
| Component registry | View GitHub repos, environments, dependency versions, Veracode scan results |
| Drift Radiator | Visual dashboard showing deployment lag/drift per team/product |
| Team Health | Staleness and drift metrics for all components owned by a team |
| Alerts | Live Prometheus alerts scoped to LAA, mapped to teams and slack channels |
| Dependencies | Track shared library/framework versions across all components |
| Component Requests | Self-service form to request new GitHub repository creation |
| Missing from Catalogue | Surface components not yet registered in the Service Catalogue |
| Scheduled Jobs | Monitor recurring jobs in the estate |
| Namespaces | Kubernetes namespace inventory |
| GitHub Teams | View GitHub team memberships and ownership |
| Product Dependencies | Inter-product dependency mapping |
| Veracode | Security static analysis scan results |
| Reports | Aggregated estate-wide reports |
| Service Areas | Organisational grouping of products |

---

## Technical Stack & Versions

### Runtime

| Technology | Version | Purpose |
|---|---|---|
| Node.js | `^24.x` | JavaScript runtime |
| npm | `^11.x` | Package manager |
| TypeScript | (via @tsconfig/node24) | Type-safe language |

### Backend Framework

| Package | Version | Purpose |
|---|---|---|
| express | `^5.2.1` | HTTP server framework |
| nunjucks | `^3.2.4` | Server-side HTML templating |
| express-session | `^1.19.0` | Session management |
| connect-redis | `^9.0.0` | Redis-backed session store |
| csrf-sync | `^4.2.1` | CSRF protection |
| helmet | `^8.1.0` | HTTP security headers |
| compression | `^1.8.1` | HTTP response compression |
| superagent | `^10.3.0` | HTTP client (outbound API calls) |
| agentkeepalive | `^4.6.0` | Keep-alive HTTP agent |
| bunyan | `^1.8.15` | Structured JSON logging |

### Data & Storage

| Package | Version | Purpose |
|---|---|---|
| redis | `^5.12.1` | Redis client (sessions + stream data) |
| applicationinsights | `^2.9.8` | Azure Application Insights telemetry |

### Frontend / UI

| Package | Version | Purpose |
|---|---|---|
| govuk-frontend | `6.1.0` | GOV.UK Design System components |
| @ministryofjustice/frontend | `^9.0.0` | MoJ Design System components |
| jquery | `^4.0.0` | DOM manipulation / AJAX |
| datatables.net | `^2.3.7` | Interactive data tables |
| datatables.net-buttons | `^3.2.6` | Column visibility, CSV export |
| datatables.net-searchpanes | `^2.3.5` | Search panel filter UI |
| datatables.net-select | `^3.1.3` | Row selection |
| mermaid | `^11.14.0` | Diagram rendering (service area diagrams) |
| dayjs | `^1.11.20` | Date/time manipulation |
| pako | `^2.1.0` | Data compression (Mermaid live editor) |
| svg-pan-zoom | `^3.6.2` | SVG diagram zoom/pan |

### Build Tools

| Package | Purpose |
|---|---|
| sass | CSS compilation (SCSS → CSS) |
| tsc | TypeScript compilation |
| eslint + @ministryofjustice/eslint-config-laa | Linting |
| jest | Unit testing |
| cypress | End-to-end integration testing |
| concurrently | Parallel watch processes in dev mode |
| nodemon | Hot-reload in dev mode |

---

## System Architecture

The application follows a layered server-rendered architecture:

```
Browser
  │
  ▼
Express App (app.ts)
  │
  ├── Middleware Chain (AppInsights → Health → Security → Session → CSRF → Static)
  │
  ├── Route Handlers  ←── Services ←── Data Clients ←── External APIs
  │                                                       ├── Service Catalogue (Strapi)
  │                                                       ├── Alertmanager
  │                                                       └── Redis
  │
  └── Nunjucks Rendered HTML → Browser
```

**Request flow:** `Browser → Route Handler → Service → Data Client → External API → render HTML`

All external HTTP calls go through a shared `RestClient` (superagent) with:
- Bearer token authentication
- Configurable response/deadline timeouts
- Automatic retries (2 attempts)
- Keep-alive HTTP agent
- Sanitised error logging (removes tokens/credentials from logs)

---

## Application Layers

### Entry Point & Bootstrap

| File | Responsibility |
|---|---|
| `server.ts` | Process entry point – imports App Insights first (for instrumentation), starts HTTP listener |
| `server/index.ts` | Calls `services()` then `createApp(services)` |
| `server/app.ts` | Registers middleware and all route modules; creates Express app |
| `server/applicationInfo.ts` | Reads `package.json` and build env vars for `buildNumber`, `gitRef`, `productId` |
| `server/config.ts` | Centralised environment variable config; throws on missing required prod vars |

App Insights **must** be initialised before other imports in `server/data/index.ts` to correctly instrument `bunyan` logging and `express` request tracking.

### Middleware Chain

Middleware is applied in strict order in `app.ts`:

| Order | Middleware | File | Purpose |
|---|---|---|---|
| 1 | App Insights | `utils/azureAppInsights.ts` | Distributed tracing, telemetry |
| 2 | Health checks | `middleware/setUpHealthChecks.ts` | `/health`, `/ping`, `/info` endpoints |
| 3 | Web security | `middleware/setUpWebSecurity.ts` | Helmet, CSP with nonce, CORS |
| 4 | Session | `middleware/setUpWebSession.ts` | Redis-backed sessions, rolling cookies |
| 5 | Request parsing | `middleware/setupRequestParsing.ts` | Body parser (JSON + URL-encoded) |
| 6 | Static resources | `middleware/setUpStaticResources.ts` | Serves `assets/` directory |
| 7 | Nunjucks | `utils/nunjucksSetup.ts` | Template engine setup, global filters |
| 8 | CSRF | `middleware/setUpCsrf.ts` | CSRF token generation/validation |
| 9 | Validation | `middleware/setUpValidationMiddleware.ts` | Flash-backed form validation |

### Route Handlers

Each route module lives in `server/routes/` and receives `services: Services` via dependency injection.

| Route prefix | File | Description |
|---|---|---|
| `/` | `routes/index.ts` | Homepage |
| `/products` | `routes/products.ts` | Product list, product detail (with components, alerts, Veracode) |
| `/components` | `routes/components.ts` | Component list, component detail with environment status |
| `/environments` | `routes/environments.ts` | Environment list and detail |
| `/reports` | `routes/reports.ts` | Aggregated estate reports |
| `/teams` | `routes/teams.ts` | Team list, team detail |
| `/product-sets` | `routes/productSets.ts` | Product set list and detail |
| `/service-areas` | `routes/serviceAreas.ts` | Service area list, diagrams |
| `/monitor` | `routes/monitor.ts` | Monitoring dashboard |
| `/dependencies` | `routes/dependencies.ts` | Dependency version browser (by type/name) |
| `/drift-radiator` | `routes/driftRadiator.ts` | Deployment drift by team/product/service-area |
| `/veracode` | `routes/veracode.ts` | Veracode security scan results |
| `/team-health` | `routes/teamHealth.ts` | Team staleness/drift health |
| `/product-dependencies` | `routes/productDependencies.ts` | Inter-product dependency graph |
| `/missing-from-catalogue` | `routes/missingFromCatalogue.ts` | Components not in catalogue |
| `/namespaces` | `routes/namespaces.ts` | Kubernetes namespace list |
| `/component-requests` | `routes/componentRequests.ts` | GitHub repo request form (with CSRF + validation) |
| `/github-teams` | `routes/githubTeams.ts` | GitHub team membership |
| `/scheduled-jobs` | `routes/scheduledJobs.ts` | Scheduled job status |
| `/alerts` | `routes/alerts.ts` | Live Prometheus alerts |

Many routes have a companion `/data` endpoint returning JSON for DataTables AJAX loading (e.g., `GET /products/data`).

### Service Layer

Services are built once at startup in `server/services/index.ts` and injected into all routes.

| Service | Class | Collaborators | Responsibility |
|---|---|---|---|
| `serviceCatalogueService` | `ServiceCatalogueService` | `StrapiApiClient` | Wraps all Strapi API calls; sorts/transforms data |
| `componentNameService` | `ComponentNameService` | `StrapiApiClient` | Component name lookups, deployed component lists, request checks |
| `redisService` | `RedisService` | `RedisClient` | Redis streams (`xRead`), JSON reads, dependency data |
| `productDependenciesService` | `ProductDependenciesService` | `StrapiApiClient`, `RedisService` | Maps inter-product dependencies via Redis dependency graph |
| `dataFilterService` | `DataFilterService` | `StrapiApiClient` | Builds dropdown filter lists for team/product/service-area/custom-view |
| `teamHealthService` | `TeamHealthService` | `RedisService`, `ServiceCatalogueService` | Calculates staleness and drift metrics from Redis version streams |
| `alertsService` | `AlertsService` | `AlertsApiClient`, `ServiceCatalogueService` | Fetches and enriches Alertmanager alerts with team/product/environment metadata |
| `teamsSummaryCountService` | `TeamsSummaryCountService` | `AlertsService`, `ServiceCatalogueService`, `StrapiApiClient` | Aggregates alert counts and Veracode findings per team |
| `monitoringChannelService` | `MonitoringChannelService` | — | Provides monitoring channel metadata |
| `recommendedVersionsService` | `RecommendedVersionsService` | `ServiceCatalogueService` | Reads `laa-template-kotlin` for recommended helm/gradle versions; TTL-cached (default 6h) |

### Data Access Layer

| Client | File | Connects To | Auth |
|---|---|---|---|
| `StrapiApiClient` | `data/strapiApiClient.ts` | Service Catalogue REST API | Bearer token (`SERVICE_CATALOGUE_TOKEN`) |
| `AlertsApiClient` | `data/alertsApiClient.ts` | Prometheus Alertmanager | None (internal k8s service) |
| `RedisClient` | `data/redisClient.ts` | Redis | Password (`REDIS_AUTH_TOKEN`), optional TLS |
| `RestClient` | `data/restClient.ts` | Shared HTTP client base | Superagent, retries, keep-alive |

**`StrapiApiClient`** exposes methods for:
- `getProducts()`, `getProduct()` – with optional `populate` for environments/components
- `getComponents()`, `getComponent()` – environment status, Veracode results, versions
- `getTeams()`, `getTeam()`
- `getServiceAreas()`, `getServiceArea()`
- `getProductSets()`, `getProductSet()`
- `getEnvironments()`, `getEnvironment()`
- `getNamespaces()`, `getNamespace()`
- `getGithubTeams()`, `getGithubTeam()`
- `getGithubRepoRequests()`, `createGithubRepoRequest()`
- `getScheduledJobs()`, `getScheduledJob()`

All Strapi queries use `createStrapiQuery({ populate })` to build Strapi v4/v5 populate/filter query strings.

---

## External Integrations

### 1. Service Catalogue (Strapi)

| Property | Value |
|---|---|
| Type | REST/JSON CMS API (Strapi) |
| URL env var | `SERVICE_CATALOGUE_URL` |
| Auth | Bearer token (`SERVICE_CATALOGUE_TOKEN`) |
| Response timeout | `SERVICE_CATALOGUE_TIMEOUT_RESPONSE` (default 5 000 ms) |
| Deadline timeout | `SERVICE_CATALOGUE_TIMEOUT_DEADLINE` (default 5 000 ms) |
| Health path | `/_health` |
| Data format | Strapi v4/v5 `{ data: [], meta: {} }` envelope |

The Service Catalogue is the **primary data source** – it stores the full LAA estate inventory: products, components, teams, service areas, environments, namespaces, GitHub repo requests, and scheduled jobs.

### 2. Prometheus Alertmanager

| Property | Value |
|---|---|
| Type | Prometheus Alertmanager HTTP API |
| URL env var | `ALERTMANAGER_URL` |
| Default (prod) | `http://monitoring-alerts-service.cloud-platform-monitoring-alerts:8080/alertmanager` |
| Auth | None (internal Kubernetes service) |
| Filter | `businessUnit="laa"` |
| Response timeout | 1 000 ms |
| Deadline timeout | 2 500 ms |
| Retries | 1 |
| Health path | `/-/healthy` |

---

## Data Storage (Redis)

Redis version: **7.4** (local dev Docker image).

Redis is used for **two separate purposes**, each with its own client instance:

### 1. Session Storage

- Created in `middleware/setUpWebSession.ts`
- Uses `connect-redis` v9 `RedisStore`
- Session TTL: `WEB_SESSION_TIMEOUT_IN_MINUTES` (default 120 minutes), rolling
- Cookie: `secure` in production, `sameSite: lax`
- TLS enabled in production (`REDIS_TLS_ENABLED=true`)

### 2. Version & Dependency Data Streams

Created in `services/index.ts` and managed by `RedisService`.

| Redis Operation | Key Pattern | Content | Used By |
|---|---|---|---|
| `JSON.GET` | `latest:versions` | Map of `component:env` → `{ v, dateAdded }` | TeamHealthService, DriftRadiator |
| `xRead` (Stream) | stream keys | Component version events | RedisService.readStream() |
| Dependency graph | internal keys | Component dependency links | ProductDependenciesService |

**Retry strategy** (exponential back-off): `min(2^attempts × 20ms, 30 000ms)` — capped at 30 seconds.

### Redis Config

| Parameter | Default | Production |
|---|---|---|
| Host | `localhost` | Managed ElastiCache (via k8s secret) |
| Port | `6379` | `6379` |
| TLS | `false` | `true` |
| TLS verification | `true` | `true` |

---

## Frontend Architecture

### Template Engine

Nunjucks templates are in `server/views/`:
- `partials/layout.njk` – base layout (GOV.UK/MoJ header, footer, navigation)
- `pages/*.njk` – one template per page

Each page template extends the layout and loads:
1. `/assets/frontendInit.js` – initialises GOV.UK Frontend and MoJ Frontend JavaScript
2. `/assets/js/common.js` – shared DataTables helpers, AJAX utilities
3. `/assets/js/<page>.js` – page-specific table/render initialisation

### JavaScript Conventions

Page scripts follow a jQuery/DataTables convention. Each page script:
- Initialises DataTables on `document.ready`
- Fetches data via AJAX from the companion `/data` endpoint
- Uses `data-test` attributes on HTML elements for stable test selectors

### Asset Pipeline

```
assets/scss/application.scss
    → sass (with govuk-frontend + moj-frontend load paths)
    → assets/stylesheets/application.css (compressed)

server/views/
    → cp -R dist/server/views/ (copy-views script)
    → served by express static / Nunjucks at runtime
```

### Page Scripts

| Script | Page | Notes |
|---|---|---|
| `products.js` | /products | Products DataTable |
| `components.js` | /components | Components DataTable |
| `teams.js` | /teams | Teams DataTable |
| `serviceAreas.js` | /service-areas | Service areas DataTable |
| `serviceAreaDiagram.js` | /service-areas/:slug | Mermaid diagram rendering |
| `environments.js` | /environments | Environments DataTable |
| `alerts.js` | /alerts | Live alerts DataTable with grouping |
| `driftRadiator.js` | /drift-radiator | Deployment drift visualisation |
| `dependencies.js` | /dependencies | Dependency version browser |
| `veracode.js` | /veracode | Veracode findings DataTable |
| `monitor.js` | /monitor | Monitoring dashboard |
| `githubTeams.js` | /github-teams | GitHub teams DataTable |
| `scheduledJobs.js` | /scheduled-jobs | Scheduled jobs DataTable |
| `namespaces.js` | /namespaces | Namespaces DataTable |
| `productSets.js` | /product-sets | Product sets DataTable |
| `productDependencies.js` | /product-dependencies | Dependency graph |
| `componentRequests.js` | /component-requests | Component requests DataTable |
| `rds.js` | /rds | RDS instances DataTable |
| `common.js` | shared | DataTables helpers, column renders |

---

## Security Architecture

| Mechanism | Implementation | Details |
|---|---|---|
| HTTP security headers | `helmet` v8 | HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Content Security Policy | Helmet CSP with nonce | `defaultSrc: 'self'`; scripts require nonce (`cspNonce` Nunjucks local); allows `www.gstatic.com`, `cdn.plot.ly`, `code.jquery.com` |
| CSRF protection | `csrf-sync` v4 | Synchronised token pattern; applied before form routes |
| Session security | `express-session` | Secret from `SESSION_SECRET` k8s secret; `secure: true` in prod; `sameSite: lax` |
| API authentication | Bearer token | `SERVICE_CATALOGUE_TOKEN` from k8s secret; sent on every Strapi API call |
| Error sanitisation | `sanitisedError.ts` | Strips auth headers/tokens from error logs before writing |
| IP allowlist | Ingress / k8s | Only `internal`, `prisons`, `unilink_staff` IP groups can access |
| Dependency audit | `audit-ci` | Configured in `audit-ci.json`; runs in CI (`npm run security_audit`) |

**OWASP Top 10 controls:**

| OWASP Category | Control |
|---|---|
| A01 Broken Access Control | IP allowlist on ingress |
| A02 Cryptographic Failures | TLS on ingress and Redis; `secure` session cookies |
| A03 Injection | No SQL DB (no injection surface); Strapi query params are programmatically generated |
| A05 Security Misconfiguration | Helmet headers; CSP nonce; missing env vars throw at startup in production |
| A07 Authentication Failures | Session rolling with expiry; CSRF tokens on all POST forms |
| A09 Logging Failures | Bunyan structured logging; App Insights telemetry; error sanitisation removes credentials |

---

## Deployment & Infrastructure

### Container

- **Dockerfile** at repo root
- Base image: Node.js (see Dockerfile for exact tag)
- Container registry: `ghcr.io/ministryofjustice/laa-developer-portal`
- Port: `3000`
- Build: `npm run build` (SCSS + TypeScript + copy-views)

### Kubernetes / Helm

- **Chart**: `helm_deploy/laa-developer-portal/` using `generic-service` chart
- **Replicas**: 4 in production
- **Environments**: dev, stage, prod (separate `values-*.yaml`)
- **Liveness probe**: `GET /ping`
- **Readiness probe**: `GET /ping`

### Kubernetes Secrets

| Secret key | Env var | Purpose |
|---|---|---|
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | `APPLICATIONINSIGHTS_CONNECTION_STRING` | Azure App Insights |
| `SESSION_SECRET` | `SESSION_SECRET` | Express session encryption |
| `SERVICE_CATALOGUE_TOKEN` | `SERVICE_CATALOGUE_TOKEN` | Bearer auth to Strapi |

### Environment-Specific Config

| Parameter | Dev | Prod |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| `REDIS_TLS_ENABLED` | `false` | `true` |
| `ALERTMANAGER_URL` | `http://localhost:8080/alertmanager` | Internal k8s service URL |
| HTTPS cookies | `false` | `true` |

### Docker Compose (local dev)

```yaml
services:
  redis-dev-portal:  # redis:7.4, port 6379
  app:               # built from Dockerfile, port 3000
                     # depends_on: redis-dev-portal
```

---

## Monitoring & Observability

### Health Endpoints

| Path | Description |
|---|---|
| `GET /health` | Full health check (app info + all external API statuses) |
| `GET /ping` | Liveness probe (always 200 if process is running) |
| `GET /info` | Build info (version, git ref, product ID) |

Health checks are provided by `@ministryofjustice/laa-monitoring` and automatically probe all configured external APIs (Service Catalogue + Alertmanager).

### Azure Application Insights

- Instrumented via `applicationinsights` SDK v2.x
- Distributed tracing mode: `AI_AND_W3C`
- Custom `ai.cloud.role` set to application name
- Custom `ai.application.ver` set to build number
- Operation name enriched with `METHOD /route/path` via middleware

### Logging

- **Library**: Bunyan with `bunyan-format`
- **Format**: JSON structured logs (short format in dev)
- **Output**: stdout → captured by Kubernetes logging
- **Start command**: `node dist/server.js | bunyan -o short`
- App Insights SDK auto-collects Bunyan logs when connected

### Prometheus Alerts

- `generic-prometheus-alerts` Helm chart configured for target `laa-developer-portal`
- Alert metrics: standard HTTP/Node.js/container metrics

---

## Developer Workflows

### Initial Setup

```bash
npm run setup          # npm ci + allowlist check
```

### Local Development

```bash
# Start all dependencies (Redis only, no app)
docker-compose up --scale=app=0

# Start app in dev mode (watch: Views + TypeScript + Node + Sass)
npm run start:dev
```

### Feature / Integration Mode

```bash
# Load feature.env and start
npm run start-feature

# Or with watch
npm run start-feature:dev
```

### Build & Quality Checks

```bash
npm run build          # Compile SCSS + TypeScript + copy views
npm run lint           # ESLint (max 0 warnings)
npm run typecheck      # TypeScript type check (main + integration_tests)
npm run test           # Jest unit tests
npm run test:ci        # Jest (single-threaded, for CI)
npm run security_audit # audit-ci dependency vulnerability scan
```

### Integration (Cypress) Tests

```bash
# 1. Start test services
docker-compose -f docker-compose-test.yml up

# 2. Start app in feature mode
npm run start-feature

# 3. Run Cypress
npm run int-test        # headless
npm run int-test-ui     # interactive UI
```

### Recommended Versions TTL

`RecommendedVersionsService` caches recommended helm/gradle versions in memory.

| Config | Env var | Default |
|---|---|---|
| TTL | `RECOMMENDED_VERSIONS_TTL_MS` | 21 600 000 ms (6 hours) |
| Template component | `LAA_TEMPLATE_COMPONENT_NAME` | `laa-template-kotlin` |
| Kotlin-only filter | `RECOMMENDED_VERSIONS_KOTLIN_ONLY` | `true` |

---

## Testing Strategy

### Unit Tests (Jest)

- Framework: **Jest** with `jest.config.mjs`
- Coverage: service layer, data clients, utilities, error handler
- Mocking: Jest mocks for external clients; test fixtures in `test-helpers.ts`

Key test files:

| Test File | What It Tests |
|---|---|
| `alertsService.test.ts` | Alert fetching, enrichment, environment mapping |
| `serviceCatalogueService.test.ts` | Product/component/team data retrieval and sorting |
| `teamHealthService.test.ts` | Staleness/drift calculation logic |
| `teamsSummaryCountService.test.ts` | Aggregated team metrics |
| `recommendedVersionsService.test.ts` | Version cache TTL and fallback logic |
| `dataFilterService.test.ts` | Dropdown list generation |
| `componentNameService.test.ts` | Component name resolution |
| `redisClient.test.ts` | Redis connection/retry policy |
| `errorHandler.test.ts` | Error response sanitisation |

### Route Tests (Supertest + Cheerio)

- Each route module has a `*.test.ts` sibling
- Uses `server/routes/testutils/appSetup.ts` to spin up a real Express app with mock services
- HTML assertions via `cheerio` on `data-test` selectors
- Service layer is fully mocked (Jest mocks of service classes)

### Integration Tests (Cypress)

- Located in `integration_tests/e2e/`
- Page Object Model in `integration_tests/pages/`
- WireMock stubs for Service Catalogue and Alertmanager (see `integration_tests/mockApis/`)
- Runs against app in `start-feature` mode (loads `feature.env`)
- Axe accessibility checks run from `integration_tests/pages/page.ts`

---

## Environment Variables Reference

### Required in Production (`requireInProduction: true`)

| Variable | Description |
|---|---|
| `BUILD_NUMBER` | CI build number (e.g. `1_2_3`) |
| `PRODUCT_ID` | MoJ product identifier |
| `GIT_REF` | Full git SHA |
| `GIT_BRANCH` | Git branch name |
| `REDIS_HOST` | Redis hostname |
| `SESSION_SECRET` | Express session signing secret |
| `SERVICE_CATALOGUE_URL` | Strapi API base URL |
| `SERVICE_CATALOGUE_TOKEN` | Strapi bearer token |
| `ALERTMANAGER_URL` | Alertmanager base URL |
| `INGRESS_URL` | Public app URL |
| `SLACK_WORKSPACE_ID` | MoJ Slack workspace ID |

### Optional / Defaults

| Variable | Default | Description |
|---|---|---|
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_AUTH_TOKEN` | — | Redis password |
| `REDIS_TLS_ENABLED` | `false` | Enable TLS for Redis |
| `REDIS_TLS_VERIFICATION` | `true` | Verify Redis TLS certificate |
| `WEB_SESSION_TIMEOUT_IN_MINUTES` | `120` | Session expiry |
| `SERVICE_CATALOGUE_TIMEOUT_RESPONSE` | `5000` | Strapi response timeout (ms) |
| `SERVICE_CATALOGUE_TIMEOUT_DEADLINE` | `5000` | Strapi deadline timeout (ms) |
| `ALERTMANAGER_TIMEOUT_RESPONSE` | `1000` | Alertmanager response timeout (ms) |
| `ALERTMANAGER_TIMEOUT_DEADLINE` | `2500` | Alertmanager deadline timeout (ms) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | — | Azure App Insights connection string |
| `RECOMMENDED_VERSIONS_TTL_MS` | `21600000` | Version cache TTL (ms) |
| `LAA_TEMPLATE_COMPONENT_NAME` | `laa-template-kotlin` | Template component for recommended versions |
| `RECOMMENDED_VERSIONS_KOTLIN_ONLY` | `true` | Only use Kotlin template for versions |
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | — | `production` enables strict config |

---

## Key Data Models

All domain types are derived from Strapi API OpenAPI schema (`server/@types/strapi-api`) and re-exported from `server/data/modelTypes.ts` for use in the service layer upward. Strapi-specific types should **not** be used above the data client layer.

### Core Entities

| Entity | Key Fields |
|---|---|
| `Product` | `name`, `slug`, `description`, `portfolio`, `team`, `product_set`, `service_area`, `components[]`, `decommissioned` |
| `Component` | `name`, `github_repo`, `product`, `envs[]`, `versions{}`, `veracode_results_summary`, `archived` |
| `Team` | `name`, `slug`, `products[]` |
| `ServiceArea` | `name`, `slug`, `products[]` |
| `ProductSet` | `name`, `slug`, `products[]` |
| `Environment` | `name`, `namespace`, `url`, `alert_severity_label`, `alerts_slack_channel`, `ns` |
| `Namespace` | Kubernetes namespace name/details |
| `GithubRepoRequest` | `github_repo`, `request_type`, `github_project_visibility`, and other new-repo fields |
| `GithubTeam` | `name`, `slug`, members |
| `ScheduledJob` | `name`, `last_successful_run` |

### Redis Data Structures

| Key | Type | Schema |
|---|---|---|
| `latest:versions` | Redis JSON | `{ "component:env": { "v": "<version-string>", "dateAdded": "YYYY-MM-DD" } }` |
| Version streams | Redis Stream | Version change events per component |
| Dependency graph | Redis keys | Component → dependency mappings (managed by `RedisService.getAllDependencies()`) |

### Recommended Versions (In-Memory Cache)

```typescript
type recommendedVersions = {
  helmDependencies: {
    genericPrometheusAlerts?: string  // from laa-template-kotlin
    genericService?: string
  }
  gradle: {
    laaGradleSpringBoot?: string
  }
  metadata: {
    source: 'strapi' | 'partial' | 'none'
    fetchedAt: string  // ISO timestamp
  }
}
```

---

## Related Pages

- [LAA Service Catalogue (Strapi)](https://link-to-strapi-docs)
- [Cloud Platform Kubernetes Docs](https://user-guide.cloud-platform.service.justice.gov.uk/)
- [GOV.UK Design System](https://design-system.service.gov.uk/)
- [LAA Engineering Guidance](https://ministry-of-justice-software-engineering.github.io/)
- [Alertmanager API Docs](https://prometheus.io/docs/alerting/latest/clients/)

---

*Last updated: May 2026 | Generated from codebase analysis of `laa-developer-portal` v0.0.1*
