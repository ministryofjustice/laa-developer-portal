# LAA Developer Portal – Architecture Diagrams

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph Client["Browser / Client"]
        Browser["Browser\n(GOV.UK Frontend + DataTables)"]
    end

    subgraph App["laa-developer-portal (Node.js / Express)"]
        direction TB
        Server["server.ts\nEntry Point"]
        AppSetup["app.ts\ncreateApp(services)"]

        subgraph Middleware["Middleware Chain"]
            direction LR
            AppInsights["Azure App Insights"]
            HealthChecks["/health /ping /info"]
            Security["Helmet + CSP"]
            Session["Session\n(RedisStore)"]
            ReqParse["Request Parsing"]
            StaticRes["Static Resources"]
            Nunjucks["Nunjucks Templating"]
            CSRF["CSRF Sync"]
        end

        subgraph Routes["Route Handlers (20+)"]
            direction TB
            R1["/ (index)"]
            R2["/products"]
            R3["/components"]
            R4["/environments"]
            R5["/teams"]
            R6["/service-areas"]
            R7["/product-sets"]
            R8["/monitor"]
            R9["/dependencies"]
            R10["/drift-radiator"]
            R11["/veracode"]
            R12["/team-health"]
            R13["/product-dependencies"]
            R14["/missing-from-catalogue"]
            R15["/namespaces"]
            R16["/component-requests"]
            R17["/github-teams"]
            R18["/scheduled-jobs"]
            R19["/alerts"]
            R20["/reports"]
        end

        subgraph Services["Service Layer"]
            SCS["ServiceCatalogueService"]
            CNS["ComponentNameService"]
            RS["RedisService"]
            PDS["ProductDependenciesService"]
            DFS["DataFilterService"]
            THS["TeamHealthService"]
            AS["AlertsService"]
            TSC["TeamsSummaryCountService"]
            MCS["MonitoringChannelService"]
            RVS["RecommendedVersionsService"]
        end

        subgraph Data["Data Access Layer"]
            SAC["StrapiApiClient"]
            AAC["AlertsApiClient"]
            RC["RedisClient"]
            REST["RestClient\n(superagent, bearer auth, retries)"]
        end
    end

    subgraph External["External Systems"]
        Strapi["Service Catalogue\n(Strapi CMS API)"]
        AM["Alertmanager\n(Prometheus Alertmanager)"]
        Redis["Redis 7.4\n(Sessions + Data Streams)"]
        AI["Azure Application Insights"]
    end

    Browser -->|HTTP Request| Middleware
    Middleware --> Routes
    Routes --> Services
    Services --> Data
    SAC --> REST
    AAC --> REST
    REST -->|Bearer token| Strapi
    REST -->|HTTP GET| AM
    RC --> Redis
    Session -->|Store| Redis
    AppInsights -->|Telemetry| AI
```

---

## 2. Request Flow – Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant Browser
    participant Express as Express App
    participant AppInsights as Azure App Insights Middleware
    participant Security as Helmet/CSP Middleware
    participant Session as Session Middleware (Redis)
    participant CSRF as CSRF Middleware
    participant Route as Route Handler
    participant Service as Service Layer
    participant StrapiClient as StrapiApiClient
    participant AlertsClient as AlertsApiClient
    participant RedisService as RedisService
    participant Strapi as Service Catalogue (Strapi)
    participant Alertmanager
    participant Redis as Redis

    Browser->>Express: HTTP GET /products
    Express->>AppInsights: correlate request (App Insights)
    AppInsights->>Security: CSP nonce + Helmet headers
    Security->>Session: load/refresh session from Redis
    Session->>Redis: HGETALL session:{id}
    Redis-->>Session: session data
    Session->>CSRF: validate CSRF token
    CSRF->>Route: forward to /products route handler

    Route->>Service: serviceCatalogueService.getProducts()
    Service->>StrapiClient: strapiApiClient.getProducts()
    StrapiClient->>Strapi: GET /v1/products?populate=...&filters=...\nAuthorization: Bearer <token>
    Strapi-->>StrapiClient: JSON product list
    StrapiClient-->>Service: Product[]
    Service-->>Route: sorted Product[]

    Route->>Express: res.render('pages/products', data)
    Express->>Browser: HTML (Nunjucks rendered)

    Note over Browser,Express: Page loads assets/js/products.js<br/>for DataTables initialization

    Browser->>Express: GET /products/data (AJAX)
    Express->>Route: /products/data handler
    Route->>Service: serviceCatalogueService.getProducts()
    Service->>StrapiClient: strapiApiClient.getProducts()
    StrapiClient->>Strapi: GET /v1/products
    Strapi-->>StrapiClient: JSON
    StrapiClient-->>Route: Product[]
    Route->>Browser: res.json(products)
```

---

## 3. Team Health & Drift Radiator Data Flow

```mermaid
sequenceDiagram
    autonumber
    participant Browser
    participant Route as teamHealth Route
    participant THS as TeamHealthService
    participant CNS as ComponentNameService
    participant RS as RedisService
    participant SCS as ServiceCatalogueService
    participant Redis
    participant Strapi

    Browser->>Route: GET /team-health
    Route->>CNS: getAllDeployedComponents()
    CNS->>SCS: getComponents()
    SCS->>Strapi: GET /v1/components
    Strapi-->>SCS: Component[]
    SCS-->>CNS: Component[]
    CNS-->>Route: deployedComponents[]

    Route->>THS: getTeamHealth()
    THS->>RS: readLatest("latest:versions")
    RS->>Redis: JSON.GET latest:versions
    Redis-->>RS: version map JSON
    RS-->>THS: Record<string, Record<string, string>>

    THS->>SCS: getTeams({ withComponents: true })
    SCS->>Strapi: GET /v1/teams?populate=components
    Strapi-->>SCS: Team[]
    SCS-->>THS: Team[]

    THS-->>Route: TeamWithComponentHealth[]
    Route->>Browser: render pages/teamHealth
```

---

## 4. Alerts Flow

```mermaid
sequenceDiagram
    autonumber
    participant Browser
    participant Route as alerts Route
    participant AS as AlertsService
    participant SCS as ServiceCatalogueService
    participant AAC as AlertsApiClient
    participant AM as Alertmanager
    participant Strapi

    Browser->>Route: GET /alerts/all
    Route->>AS: getAndSortAlerts(serviceCatalogueService)

    AS->>AAC: getAlerts()
    AAC->>AM: GET /alerts?filter=businessUnit="laa"
    AM-->>AAC: Alert[]
    AAC-->>AS: Alert[]

    AS->>SCS: getEnvironments()
    SCS->>Strapi: GET /v1/environments
    Strapi-->>SCS: Environment[]

    AS->>SCS: getTeams()
    SCS->>Strapi: GET /v1/teams
    Strapi-->>SCS: Team[]

    AS->>SCS: getProducts()
    SCS->>Strapi: GET /v1/products
    Strapi-->>SCS: Product[]

    AS->>AS: addNewPropertiesToAlert()\nmapAlertEnvironments()
    AS-->>Route: enriched Alert[]
    Route->>Browser: res.json(alerts)
```

---

## 5. Application Startup & Dependency Wiring

```mermaid
flowchart TD
    A["server.ts\nimport applicationinsights"] --> B["server/index.ts\ncreateApp(services())"]
    B --> C["server/data/index.ts\ninitialiseAppInsights()\nbuildAppInsightsClient()"]
    C --> D["StrapiApiClient\nAlertApiClient"]
    B --> E["server/services/index.ts\nservices()"]
    E --> F1["ServiceCatalogueService\n(strapiApiClientBuilder)"]
    E --> F2["ComponentNameService\n(strapiApiClientBuilder)"]
    E --> F3["RedisService\n(redisClient)"]
    E --> F4["ProductDependenciesService\n(strapiApiClientBuilder, redisService)"]
    E --> F5["DataFilterService\n(strapiApiClientBuilder)"]
    E --> F6["TeamHealthService\n(redisService, serviceCatalogueService)"]
    E --> F7["AlertsService\n(alertsApiClient)"]
    E --> F8["TeamsSummaryCountService\n(alertsService, serviceCatalogueService)"]
    E --> F9["MonitoringChannelService"]
    E --> F10["RecommendedVersionsService\n(serviceCatalogueService)"]
    B --> G["app.ts createApp(services)"]
    G --> H["Middleware setup\n(AppInsights → HealthChecks → Security\n→ Session → Parsing → Static → Nunjucks → CSRF)"]
    H --> I["Route registration\n20+ route modules"]
    I --> J["Error handler\n404 + production error handler"]
```

---

## 6. Component Request Form Flow (POST with Validation)

```mermaid
sequenceDiagram
    autonumber
    participant Browser
    participant CSRF as CSRF Middleware
    participant Route as componentRequests Route
    participant CNS as ComponentNameService
    participant SCS as ServiceCatalogueService
    participant Validator as validateRequest()
    participant Strapi

    Browser->>Route: GET /component-requests/new
    Route->>Browser: render pages/componentRequestForm

    Browser->>CSRF: POST /component-requests/new (with CSRF token)
    CSRF->>Route: validated request body

    Route->>CNS: checkComponentExists(github_repo)
    CNS->>Strapi: GET /v1/components?filters[github_repo]=...
    Strapi-->>CNS: Component[]
    CNS-->>Route: boolean

    Route->>CNS: checkComponentRequestExists(github_repo, 'Add')
    CNS->>Strapi: GET /v1/github-repo-requests?filters=...
    Strapi-->>CNS: boolean
    CNS-->>Route: boolean

    Route->>Validator: validateRequest(req, validationFn)
    alt Validation fails
        Validator-->>Route: flash errors
        Route->>Browser: redirect back with errors
    else Validation passes
        Route->>SCS: createGithubRepoRequest(formData)
        SCS->>Strapi: POST /v1/github-repo-requests
        Strapi-->>SCS: created request
        SCS-->>Route: GithubRepoRequest
        Route->>Browser: redirect to /component-requests/confirmation
    end
```

---

## 7. Kubernetes Deployment Architecture

```mermaid
graph TB
    subgraph K8s["Kubernetes Cluster (Cloud Platform)"]
        subgraph NS["laa-developer-portal namespace"]
            direction TB
            Ingress["Ingress (TLS)\n*.service.justice.gov.uk"]
            subgraph Pods["Deployment (4 replicas)"]
                Pod1["Pod 1\nNode.js :3000"]
                Pod2["Pod 2\nNode.js :3000"]
                Pod3["Pod 3\nNode.js :3000"]
                Pod4["Pod 4\nNode.js :3000"]
            end
            RedisK8s["Redis (ElastiCache)\nport 6379 TLS"]
        end
        subgraph Monitoring["cloud-platform-monitoring-alerts"]
            AMService["alertmanager-service\n:8080/alertmanager"]
        end
    end

    subgraph Secrets["Kubernetes Secrets"]
        S1["APPLICATIONINSIGHTS_CONNECTION_STRING"]
        S2["SESSION_SECRET"]
        S3["SERVICE_CATALOGUE_TOKEN"]
    end

    subgraph ExternalSvc["External Services"]
        StrapiExt["Service Catalogue\n(Strapi API)"]
        AIExt["Azure Application Insights"]
    end

    Internet["Internet / MoJ Internal\n(IP Allowlist: internal, prisons, unilink_staff)"] --> Ingress
    Ingress --> Pods
    Pods --> RedisK8s
    Pods --> AMService
    Pods --> StrapiExt
    Pods --> AIExt
    Secrets --> Pods
```
