# Featherlog: plan del clon open-source de Headway

> Fecha: 2026-10-04 · v3 (plan de ejecución completo, incluido el despliegue). Basado en la web, la documentación, el código del widget, la página pública, el iframe del widget y una revisión del panel con sesión iniciada (solo lectura: no se guardó nada).

## 1. Qué es Headway

Headway es un **changelog hospedado** con tres superficies. Por dentro es Rails con GraphQL para los ajustes, ActiveStorage para los ficheros y Vite/React en el panel.

### 1.1 Panel = la propia página pública, en modo edición

No hay un “dashboard” aparte. Con la sesión iniciada, la página pública (`/<slug>`) muestra además:
- Un botón **“New changelog”** arriba y **“Edit”** en cada entrada.
- Un **menú lateral (☰)** con:
  - el selector de cuentas, porque un usuario puede tener varias (aquí “Nailted” y “Nailted ES”);
  - “New account”;
  - “Settings”, que abre una ventana superpuesta con pestañas;
  - “Sign out”.
- La paginación es un botón **“Show previous changelogs”** que carga más entradas.

### 1.2 Editor de entradas (panel lateral)

| Elemento | Detalle |
|---|---|
| Título | Campo grande en la cabecera. |
| Categorías | Desplegable de etiquetas de color. Añadir una inserta `[New]` en el cuerpo: las categorías van **dentro del Markdown**, lo que permite varias secciones por entrada. |
| Autor | Desplegable con los miembros del equipo; muestra su “display name”. |
| Fecha | “now” o una fecha y hora futura. Así se programa la publicación. |
| Cuerpo | Markdown en texto plano. |
| Barra de herramientas | H, B, I, imagen (sube a la nube), lista numerada, lista, enlace, cita, código, bloque de código y ayuda (?). |
| Pie | Delete, Cancel, interruptor **Published** (si está apagado, la entrada queda como borrador) y Save. |
| Vista previa | Se ve **en la propia lista de la izquierda mientras escribes**: “Title (Draft)”, etiquetas y autor. |

### 1.3 Ajustes (pestañas)

- **Profile**: nombre, *display name* (aparece junto a los posts), cargo (*job title*, se ve bajo el título), foto, email, suscripción a consejos, contraseña e inicio de sesión con Google o email.
- **Account**:
  - Nombre de la empresa (cambiarlo **cambia el slug y la URL**).
  - **Terminology**, para llamarlo Changelog, Release-notes, Changes, Updates o News.
  - **Whitelabel** (oculta la marca Headway) y logo de la empresa.
- **Public page**:
  - Color de acento, URL de la web y dominio propio.
  - **Show authors**.
  - **Hide from search engines** (solo se puede entrar con el enlace directo).
  - **Private mode**: las páginas solo son accesibles desde los enlaces del widget.
- **Widget**:
  - Snippet para copiar (`HW_config` con `account: "<id de 6 caracteres>"`) y color de acento propio.
  - **Delay showing badge** (0, 1, 3, 6, 10 o 30 s) y **Entries limit** (2–6).
  - **Expire badge count**: tras N días (3, 6, 10, 15 o 30), las entradas ya no cuentan en el badge.
  - **Soft-hide badge**: si no hay novedades, el badge se encoge y se vuelve gris en vez de desaparecer.
  - **Progressive Eyecatcher**: animaciones para insistir en que se haga clic.
- **Categories**: nombre y color (por defecto Fix, Improvement y New). Se pueden añadir y ordenar.
- **Team**: invitar por email, con estado (Accepted o pendiente) y roles **Owner** y **Editor**.
- **Integrations** (fuera de la v1): Twitter (publica un resumen, el enlace y `#changelog`) y Slack (mensaje a un canal al publicar).
- **Plans, GDPR y Billing**: fuera de alcance.
  - Free: changelogs ilimitados, personalización, Twitter, eyecatcher y RSS.
  - Pro: whitelabel, dominio propio, categorías propias, integraciones, equipo, privacidad, modo privado y programación.

**No hay analítica, ni reacciones, ni exportación de datos, ni multi-idioma.**

### 1.4 Página pública
- Listado con “cargar más”, detalle en `/<slug>/<titulo-slug>-<id>`, RSS en `/rss` y OG.
- La fecha se muestra en el margen con un tooltip de fecha y hora completas. Opcionalmente, autor con su avatar.

### 1.5 Widget

**Loader (`widget.js`)**
- Inyecta `#HW_badge_cont > #HW_badge` en el `selector` y un `iframe` hacia `headway-widget.net/widgets/<ACCOUNT_ID>`.
- Opciones públicas: `selector`, `account`, `enabled`, `trigger`, `position.{x,y}`, `translations.{title,readMore,footer,labels}` y `callbacks.{onWidgetReady(w.getUnseenCount()),onShowWidget,onShowDetails(item),onReadMore(item),onHideWidget}`.
- Opciones sin documentar: `embed`, `token`, `styles`, `apiMode`, `googleAnalytics` y `debug`.
- `Headway.init(config)` reinicia el widget (pensado para SPAs).
- Guarda el estado de visto y leído en el `localStorage` del host (últimos 30 IDs).
- **Protocolo `postMessage`**:
  - Del iframe al host: `widgetReady`, `setBadge`, `setHeight`, `setState`, `setAction`, `hide` y `migrateLocalStorage`.
  - Del host al iframe: `ready`, `opened`, `closed`, `markSeen`, `markRead`, `markAllSeen` y `reload`.

**Iframe**
- HTML renderizado en el servidor, con la configuración de la cuenta incrustada: `badgeDelay`, `softHide`, `eyecatcher`, `expireAfter`, `token`, `autorefresh` y `track`.
- Dos vistas:
  1. **Lista**: título del widget; por cada entrada, categoría, título y extracto de unos 100 caracteres; y un footer que enlaza a la página pública.
  2. **Detalle** dentro del propio widget: botón atrás, contenido (truncado si es largo) y “Read the whole post”.
- Admite RTL (`body.ltr`).

## 2. Mejora diferencial: multi-idioma nativo

**Hoy en Headway** cada idioma es una *cuenta distinta* (“Nailted” y “Nailted ES”). Eso implica:
- Duplicar ajustes, categorías y equipo.
- Dos snippets de widget, con lógica en tu app para elegir cuál cargar.
- Nada que relacione una entrada con su traducción.

**Nuestro modelo**
- Un workspace tiene un **idioma por defecto** y una lista de **idiomas activos**.
- Una **entrada** es una sola: la fecha, el autor, el estado y las categorías son compartidos. Lo que cambia por idioma son sus **traducciones** (título, slug y cuerpo).
- Las **categorías** tienen el nombre traducido por idioma.
- **Editor**: pestañas por idioma junto al título, con un indicador de traducción pendiente o completa y la opción “copiar desde el idioma por defecto”. En el futuro, en la nube: “traducir con IA”.
- **Política si falta una traducción** (ajuste del workspace): *mostrar en el idioma por defecto* u *ocultar en ese idioma*.
- **Widget**:
  - Opción `language: "es"`. Si no se indica, se toma de `<html lang>` y, si no, de `navigator.language`. Si el idioma no está activo, se usa el por defecto.
  - Los textos de la interfaz del widget (título, “leer más”, footer, “hace 3 días”) vienen traducidos de serie para los idiomas soportados, y se pueden sobrescribir.
  - **Un solo snippet para todos los idiomas.**
- **Página pública**: `/<slug>` usa el idioma por defecto y `/<slug>/<lang>/...` el resto. Incluye selector de idioma, `hreflang`, RSS por idioma y fechas localizadas.
- **El estado de “visto” se guarda por ID de entrada** (no por traducción). Si un usuario cambia de idioma, no le vuelven a aparecer como nuevas.
- **Importador desde Headway** (después de la v1): fusionar N cuentas de Headway, una por idioma, en un workspace, emparejando las entradas por fecha y permitiendo ajustar las parejas a mano.

## 3. Alcance de la v1

**Incluido**
1. **Auth y cuentas**:
   - Email con contraseña, magic link y Google OAuth.
   - Varios workspaces por usuario, con selector.
   - Roles `owner`, `admin` y `editor`, e invitaciones por email.
2. **Entradas**:
   - Borrador, programada o publicada.
   - Editor Markdown con barra de herramientas, subida de imágenes por pegado o arrastre, vista previa en vivo y autoguardado del borrador.
   - Categorías inline `[Cat]`, autor y fecha.
3. **Multi-idioma nativo** (§2).
4. **Categorías** con color, orden y traducciones.
5. **Página pública**:
   - Listado y detalle, RSS por idioma, OG, `hreflang` y sitemap.
   - Opciones *show authors*, *noindex* y *modo privado*.
   - *Terminology* y whitelabel.
6. **Widget** compatible con `HW_config`, con todas las opciones de §1.5 y las del panel.
7. **API REST pública + servidor MCP** para publicar y controlar Featherlog desde otras plataformas y agentes (§9).
8. **Autohospedaje** en un comando, más **nuestra instancia en producción** (demo y dogfooding) con CI/CD.

**Fuera de la v1, pero con el diseño preparado**: facturación, GDPR, integraciones (Slack, X…), webhooks salientes, dominio propio con SSL, suscriptores por email, segmentación por `token`, analítica, reacciones e importador.

## 4. Stack definitivo (pensado para que lo construya yo de principio a fin)

Al escribir yo todo el código, priorizo cuatro cosas:
- **Tipos de extremo a extremo**, para que el compilador detecte mis errores.
- **Poca “magia”**: comportamiento explícito y fácil de verificar.
- **Tests rápidos** que pueda ejecutar en cada cambio sin depender de servicios externos.
- **Una sola pieza desplegable.**

| Pieza | Elección | Cambio respecto a la v2 y motivo |
|---|---|---|
| Monorepo | **pnpm workspaces** (sin Turborepo) | Turborepo sobra para 1 app + 5 paquetes. Menos configuración. |
| App | **Next.js (App Router), `output: "standalone"`** | Sin cambios. La caché de `fetch` y las rutas estáticas implícitas quedan **desactivadas**: renderizado dinámico y cabeceras `Cache-Control` propias, para que el comportamiento sea predecible. |
| Mutaciones del panel | **Server Actions con validación zod** en una capa `core` pura | La lógica vive en `packages/core`, testeable sin Next. Las actions solo hacen de adaptadores. |
| BD | **PostgreSQL 17 + Drizzle** | Sin cambios. |
| BD en tests | **PGlite** (Postgres en WASM) para unitarios y de integración; Postgres real en CI y E2E | **Nuevo.** Tests de BD en milisegundos, sin Docker, que puedo ejecutar en bucle. |
| Auth | **Better Auth** (plugins: organization, magicLink, Google) | Sin cambios. |
| Jobs | **pg-boss** | Sin cambios. En la v1 solo se usa para emails y para la limpieza de ficheros huérfanos. |
| **Iframe del widget** | **HTML renderizado en el servidor por la misma app** + un script vanilla de ~3 KB (navegación lista↔detalle y `postMessage`) | **Cambio:** se elimina Preact. Es lo que hace Headway, pesa menos y queda una pieza menos. Se sirve en otro *hostname* (`WIDGET_URL`) que el middleware enruta a `/_widget/*`. |
| Loader del widget | **TypeScript vanilla, compilado con esbuild** a un IIFE | Sin cambios. Presupuesto: ≤6 KB gz, vigilado con `size-limit` en CI. |
| Editor | **CodeMirror 6** con modo Markdown, barra propia y extensiones de pegado y arrastre de imágenes | **Concretado.** Robusto y accesible, y permite insertar `[Cat]` como “chips”. |
| Markdown | `unified` / `remark` / `rehype` + `rehype-sanitize` + **Shiki** + plugins propios | Sin cambios. El mismo paquete se usa en el servidor (al guardar) y en el cliente (vista previa). |
| Imágenes | `sharp`: miniaturas y WebP al subir, guardando las dimensiones para evitar saltos de maquetación (CLS) | Concretado. |
| Ficheros | Interfaz `Storage` con dos implementaciones: `local` (volumen) y `s3` (R2, MinIO o AWS) | Sin cambios. |
| Email | Nodemailer (SMTP) + React Email; **Mailpit** en desarrollo | **Nuevo:** Mailpit me permite verificar emails en los E2E. |
| i18n de la interfaz | `next-intl` en el panel y la página pública; diccionario JSON en el iframe | Sin cambios. Panel en inglés y español desde el día 1. |
| UI | Tailwind v4 + shadcn/ui + lucide | Sin cambios. |
| Lint y formato | **Biome** | **Cambio:** una sola herramienta rápida en lugar de ESLint + Prettier. |
| Tests | **Vitest** (unitarios e integración) + **Playwright** (E2E: panel, página pública y widget sobre páginas host de prueba, incluida una SPA) | Sin cambios. |
| Validación y contratos | **zod** compartido: formularios, actions, API del widget y protocolo `postMessage` | Concretado. |
| Licencia | **AGPL-3.0** y `ee/` en el futuro | Sin cambios. |

## 5. Arquitectura

```
                ┌──────────────── 1 imagen Docker ────────────────┐
 navegador ──►  │ Next.js (standalone)                            │
 (panel,        │  ├─ middleware: resuelve host → {app|public|widget}│
  público,      │  ├─ /app/*            panel (auth)               │
  iframe)       │  ├─ /[slug]/*         página pública (SSR)        │
                │  ├─ /_widget/*        iframe HTML (SSR, sin React)│
 web cliente ─► │  ├─ /widget.js        loader (estático, CDN)      │
                │  └─ /api/*            auth, uploads, widget JSON  │
                │ worker (mismo código, `node worker.js`) pg-boss   │
                └───────────────┬───────────────────┬──────────────┘
                           PostgreSQL         Storage (disco | S3/R2)
```

- **Un solo código, dos procesos**: `web` y `worker`. En el autohospedaje más sencillo, el worker puede correr dentro del mismo proceso (`WORKER_MODE=inline`).
- **Hosts**: `APP_URL`, `PUBLIC_URL` y `WIDGET_URL` pueden ser el mismo dominio en local y distintos en producción. El middleware decide qué rutas atiende cada uno.
- **Caché**:
  - El JSON y el HTML del widget, y la página pública, llevan `Cache-Control: public, s-maxage=60, stale-while-revalidate=600` + `ETag`.
  - `widget.js` lleva `max-age=3600`.
  - Los ficheros con hash son inmutables.
  - Con un CDN delante (Cloudflare) escala a muchísimo tráfico de widget sin tocar el servidor.

## 6. Estructura del repo

```
/apps/web                 Next.js
  /app/(panel)/app/...    panel
  /app/(public)/[slug]/...página pública
  /app/_widget/...        iframe
  /app/api/...            auth, uploads, widget
  /worker.ts              entrypoint del worker
/packages
  /core      dominio puro: posts, i18n, categorías, permisos, entitlements, eventos, servicios
  /db        esquema Drizzle, migraciones, seeds, helpers de test (PGlite)
  /markdown  pipeline + plugins (+ tests de snapshot)
  /widget    loader.ts, frame.ts, protocol.ts (zod), build con esbuild
  /i18n      locales soportados, strings del widget y de la página pública
  /ui        componentes shadcn compartidos
  /emails    plantillas React Email
/e2e         Playwright + páginas host de prueba (estática, SPA React, embed)
/docker      Dockerfile, compose.yml (prod), compose.dev.yml (pg + mailpit + minio)
/deploy      Caddyfile, scripts de backup, ejemplo de .env
/docs        self-host, configuración, widget, migración desde Headway, markdown, ADRs
```

## 7. Modelo de datos (v1)

```
users / sessions / accounts / verifications   (gestionadas por Better Auth)
users (+)          display_name, job_title, avatar_url, locale_ui
workspaces         id, public_id (8 chars), slug (único), name, logo_asset_id,
                   website_url, accent_color, terminology, whitelabel, show_authors,
                   noindex, private_mode, default_locale, locales text[],
                   missing_translation (fallback|hide), custom_domain (null), created_at
memberships        user_id, workspace_id, role (owner|admin|editor)
invitations        id, workspace_id, email, role, token_hash, status, expires_at, invited_by
categories         id, workspace_id, color, position
category_i18n      category_id, locale, name, slug
posts              id, workspace_id, public_id, author_id, published, published_at,
                   created_at, updated_at, deleted_at (borrado blando)
post_i18n          post_id, locale, title, slug, content_md, content_html, excerpt,
                   updated_at        UNIQUE(post_id, locale)
post_categories    post_id, category_id        (derivado al guardar a partir de los [Cat])
assets             id, workspace_id, storage_key, mime, size, width, height, uploaded_by
widget_settings    workspace_id, accent_color, badge_delay_s, entries_limit,
                   expire_after_days, soft_hide, eyecatcher (off|on|progressive),
                   position jsonb, ui_strings jsonb (por locale)
slug_redirects     workspace_id, old_slug          (al renombrar el workspace no se rompen URLs)
api_keys           id, workspace_id, name, prefix, hash, scopes text[], last_used_at,
                   expires_at, created_by
idempotency_keys   key, api_key_id, request_hash, response jsonb, created_at (TTL 24 h)
oauth_*            (gestionadas por Better Auth: clientes, tokens y consentimientos)
posts (+)          created_via (panel|api|mcp), actor_label
workspaces (+)     integrations_can_publish (por defecto false)
```

- **Visible** = `published AND published_at <= now() AND deleted_at IS NULL`.
- **Índices**: `(workspace_id, published, published_at desc)`, `post_i18n(post_id, locale)` y `workspaces(slug)`.
- **Categorías inline**: `[Fix]` al principio de una línea se resuelve contra los nombres de categoría *en ese idioma*. En el editor se insertan desde el desplegable, así que el usuario no las teclea.

## 8. Rutas y contratos

**Panel** (`APP_URL`)

| Ruta | Pantalla |
|---|---|
| `/login`, `/signup`, `/invite/:token` | Acceso e invitaciones |
| `/app` | Redirige al último workspace usado |
| `/app/:ws/posts` | Lista con filtros por estado (todas, borradores, programadas, publicadas) e idioma, y búsqueda |
| `/app/:ws/posts/new` y `/app/:ws/posts/:id` | Editor: panel lateral con la vista previa real de la página pública a la izquierda |
| `/app/:ws/settings/{profile,workspace,public-page,widget,categories,languages,team}` | Ajustes |
| `/app/new` | Crear workspace |

**Página pública** (`PUBLIC_URL`)

| Ruta | Contenido |
|---|---|
| `/:slug` y `/:slug/:lang` | Listado, con `?page=` o “cargar más” y `?category=` |
| `/:slug[/:lang]/:postSlug-:publicId` | Detalle |
| `/:slug[/:lang]/rss` | RSS |
| `/sitemap.xml` y `/robots.txt` | Respetan *noindex* y *privado* |

**Widget** (`WIDGET_URL`)

| Ruta | Contenido |
|---|---|
| `/widget.js` | Loader |
| `/_widget/:publicId?lang=&token=` | HTML del iframe (lista + detalle) con la configuración incrustada |
| `/api/widget/:publicId?lang=` | El mismo contenido en JSON para `apiMode` (headless): `{ settings, categories, posts:[{id,title,excerpt,html,date,categories,url}] }` |

**Protocolo `postMessage`**, versionado (`v:1`) y validado con zod en los dos lados, comprobando siempre `origin`. Los nombres de mensaje son los de Headway (§1.5) más `setLocale`.

**Loader**: acepta `HW_config` y `window.Headway.init(config)`. La API propia es `window.Featherlog`; `window.Headway` y `HW_config` se mantienen como alias de compatibilidad. Opciones de Headway, más `language` y `widgetUrl` (para el autohospedaje).

## 9. API REST y MCP (en la v1)

**Principio: una sola lógica, cuatro puertas.** El panel, la API REST, el MCP y el widget llaman a los mismos servicios de `packages/core` (`posts.create`, `posts.publish`…), con zod y comprobación de permisos dentro. Ninguna puerta tiene lógica propia: lo que puede hacer una persona en el panel lo puede hacer un agente, con las mismas reglas.

### 9.1 API REST v1
- **Implementación**: Hono + `@hono/zod-openapi`, montado en Next en `/api/v1/[...route]`. Los esquemas zod generan la validación, los tipos y la especificación OpenAPI 3.1. Documentación interactiva con Scalar en `/api/docs`.
- **Autenticación**:
  - **API keys por workspace** (Ajustes → API). Formato `fl_live_…`; se guarda solo el hash y se muestra el prefijo. Tienen nombre, último uso y caducidad opcional, y scopes: `posts:read`, `posts:write`, `posts:publish`, `categories:write`, `assets:write`, `settings:write` y `members:admin`.
  - **OAuth 2.1** (Better Auth, plugins `oidcProvider`/`mcp`) para clientes que actúan en nombre de un usuario, como los conectores MCP remotos.
- **Endpoints**:
  - `GET/PATCH /workspace`, `GET /locales`.
  - `GET /posts` (filtros de estado, idioma y categoría; paginación por cursor), `POST /posts`, `GET/PATCH/DELETE /posts/:id`.
  - `PUT /posts/:id/translations/:locale`.
  - `POST /posts/:id/publish`, `/unpublish` y `/schedule` (`{publishAt}`).
  - `POST /preview` (Markdown → HTML con nuestras extensiones).
  - `GET/POST/PATCH/DELETE /categories`.
  - `POST /assets` (multipart, o `{url}` para que el servidor la descargue).
  - `GET/PATCH /widget-settings`, `GET /members`, `POST /invitations`.
- **Garantías para integraciones y agentes**:
  - `Idempotency-Key` en los POST: un reintento no duplica entradas.
  - `ETag` / `If-Match` en los PATCH: un agente no pisa lo que una persona está editando.
  - Errores RFC 9457 (`application/problem+json`), límite de peticiones por clave con cabeceras `RateLimit-*` y versión en la URL.
- **Trazabilidad**: cada entrada guarda `created_via` (`panel|api|mcp`) y el actor. En el panel se ve, por ejemplo, «Creado por *Claude (MCP)*».
- **Seguro por defecto**: el ajuste «Las integraciones pueden publicar directamente» viene desactivado. Sin él, la API y el MCP solo crean borradores; publicar exige el scope `posts:publish` *y* el ajuste activo.

### 9.2 Servidor MCP
- **SDK oficial `@modelcontextprotocol/sdk`**, transporte Streamable HTTP sin estado en `/mcp`. Autenticación por OAuth 2.1 (para añadirlo como conector en Claude, ChatGPT o Cursor sin copiar claves) o `Authorization: Bearer <api key>`.
- **Paquete `@featherlog/mcp`** con transporte stdio para clientes locales (`npx @featherlog/mcp --url … --key …`). Es un envoltorio fino sobre la API REST.
- **Tools** (con anotaciones `readOnlyHint`/`destructiveHint` y salida estructurada):
  - `list_workspaces`, `get_workspace`.
  - `list_posts`, `get_post`, `create_post` (borrador por defecto), `update_post`, `set_translation`.
  - `publish_post`, `schedule_post`, `unpublish_post`, `delete_post`.
  - `list_categories`, `create_category`, `upload_image` (URL o base64), `preview_markdown`.
  - `get_widget_settings`, `update_widget_settings`.
- **Resources**: guía de Markdown (`[Cat]`, vídeos, `=WxH`), información del workspace (idiomas y categorías) y últimas entradas.
- **Prompts**: `release_notes_from_changes` (de commits o PRs a un borrador) y `translate_post` (a todos los idiomas activos).
- **Documentación**: guías para Claude Desktop, Claude Code, Cursor y ChatGPT, y ejemplos con curl.

## 10. Decisiones pensando en la versión cloud
1. **Multi-tenant** desde el día 1: `workspace_id` en todo y permisos centralizados en `core`.
2. **Entitlements**: `can(ws, feature)`. En el autohospedaje siempre devuelve `true`; en la nube consultará el plan.
3. **Resolución del tenant por host** (ruta, subdominio o dominio propio), con la interfaz hecha desde la v1.
4. **Orígenes configurables** (`APP_URL`, `PUBLIC_URL`, `WIDGET_URL`).
5. **Interfaces conmutables**: `Storage`, `Mailer` y `Queue`.
6. **Eventos de dominio** (`post.published`, `post.updated`, `post.deleted`), emitidos en una tabla `events` (*outbox*) desde la v1. Integraciones y webhooks consumirán de ahí.
7. **Respuestas del widget cacheables** en un CDN.
8. **Sin telemetría** en la versión open source. Opción `track` reservada.

## 11. Forma de trabajo (cómo lo voy a construir yo)

- **Repositorio en GitHub** con ramas por hito y PRs que puedes revisar o simplemente aprobar. CI en verde antes de fusionar.
- **Bucle de verificación en cada tarea**:
  1. `typecheck` + `biome` + tests unitarios e integración (PGlite).
  2. E2E de Playwright de lo tocado.
  3. Comprobación visual en el navegador integrado (panel, página pública y widget sobre una página host).
- **Tests como criterio de “hecho”**. Cada hito de §13 tiene criterios de aceptación automatizados.
- **Seeds realistas** (`pnpm db:seed`): dos workspaces, tres idiomas, 30 entradas con imágenes, vídeos y varias categorías. Sirven para demos y E2E.
- **ADRs cortos** en `docs/adr/` para las decisiones que no se ven en el código.
- **Checkpoints contigo** al final de cada hito: te paso el enlace de la preview y un resumen, y tú das el OK o pides cambios.

## 12. Despliegue

### 11.1 Autohospedaje (usuarios de la versión open source)
- **Imagen única** `ghcr.io/joserobleda/featherlog:<versión>` (multi-arch amd64/arm64) con dos comandos: `web` y `worker`.
- **`compose.yml`** con `app` (web + worker inline), `postgres:17` y volúmenes `pgdata` y `uploads`. **Caddy** opcional para HTTPS automático.
- **Migraciones automáticas al arrancar** (`MIGRATE_ON_START=true`, con bloqueo en BD para evitar carreras).
- **Configuración por variables de entorno**, documentadas y validadas con zod al arrancar (falla rápido con un mensaje claro):

```
DATABASE_URL  APP_URL  PUBLIC_URL  WIDGET_URL  AUTH_SECRET
STORAGE_DRIVER=local|s3  S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY S3_PUBLIC_URL
SMTP_URL  MAIL_FROM  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET (opcional)
SIGNUP_MODE=open|invite|closed   WORKER_MODE=inline|separate   MIGRATE_ON_START
```

- **Plantillas de un clic** para Coolify, Railway y Render (después de la v0.1).
- `SIGNUP_MODE`: en el autohospedaje, por defecto, el primer usuario se convierte en administrador y el registro se cierra.

### 11.2 Nuestra instancia (demo, dogfooding y base de la futura nube)

**Decidido**: el VPS de **Hetzner que ya existe** + Docker Compose + Caddy + Cloudflare. El repositorio va en la **cuenta personal de GitHub (joserobleda)**. Es barato y sin dependencia de proveedor. Además, Caddy con *on-demand TLS* resuelve los dominios propios de los clientes cuando llegue la nube.

| Pieza | Elección |
|---|---|
| Servidor | VPS de Hetzner existente (pendiente: confirmar qué corre ya en él y si hay un proxy delante) |
| Proxy y TLS | Caddy |
| BD | Postgres en el mismo VPS, con copias diarias a R2 (`pg_dump` cifrado, retención de 30 días) y una prueba de restauración en CI cada semana. Cuando haya clientes de pago: Postgres gestionado (Neon o Crunchy) |
| Ficheros | Cloudflare R2 |
| DNS y CDN | Cloudflare. Proxy y caché para `widget.<dominio>` y los assets; el panel, sin caché |
| Email | Resend, Postmark o Amazon SES (por SMTP, sin integración específica) |
| Errores y logs | Sentry opcional (`SENTRY_DSN`). Logs JSON (`pino`) recogidos por `docker logs` o Better Stack. Endpoint `/healthz`, vigilado por Uptime Kuma o Better Stack |

**Dominios** (ejemplo):
- `app.<dominio>`: panel.
- `<dominio>/<slug>` o `<slug>.<dominio>`: páginas públicas.
- `widget.<dominio>`: loader e iframe.

### 11.3 CI/CD (GitHub Actions)
1. **En cada PR**: instalar dependencias, `biome`, `typecheck`, Vitest, build, `size-limit` y Playwright contra Postgres en un contenedor de servicio.
2. **Al fusionar en `main`**: construir la imagen y publicarla en GHCR con la etiqueta `main-<sha>`. Después, desplegar en **staging** por SSH (`docker compose pull && up -d`; las migraciones se aplican al arrancar) y hacer una comprobación de humo sobre `/healthz` y el widget.
3. **Al etiquetar una versión (`v*`)**: release en GHCR con las etiquetas `vX.Y.Z` y `latest`, changelog generado (publicado en nuestra propia instancia) y despliegue en **producción**, con aprobación manual en GitHub Environments.
4. **Rollback**: volver a desplegar la etiqueta anterior. Las migraciones solo pueden añadir cosas (*expand/contract*) para que el rollback sea seguro.

### 11.4 Lo que necesitarás hacer tú (yo no puedo crear cuentas ni introducir credenciales)
- Crear el repositorio en GitHub (o decirme en qué organización) y darme acceso con `gh`.
- Contratar el VPS, el dominio, Cloudflare con R2 y el proveedor de email, y guardar los secretos en GitHub Actions y en el `.env` del servidor. Yo te dejo la lista exacta y los scripts. El provisionado del VPS (usuario, firewall, Docker y Caddy) lo dejo en un script `deploy/bootstrap.sh` idempotente.
- Crear el OAuth client de Google, si queremos ese login en producción.

## 13. Hitos detallados y criterios de aceptación

**H0. Cimientos**
- Monorepo pnpm, Biome, tsconfig estricto, `compose.dev.yml` (pg, mailpit y minio), validación de variables de entorno y CI básica.
- Drizzle con migraciones y helpers de test con PGlite.
- Better Auth (email, magic link y Google), modelos de workspace y membresía, onboarding (crear workspace y slug) y selector. Layout del panel con `next-intl` (en/es).
- ✅ Un usuario nuevo se registra, verifica el email (visto en Mailpit), crea un workspace y llega al panel vacío. E2E en verde.

**H1. Markdown**
- `packages/markdown`: GFM, sanitizado, Shiki, embeds (YouTube, Vimeo, Loom y Wistia, en línea propia o al final de una línea, y con sintaxis de imagen), `=WxH`, `[Cat]` y extractos.
- ✅ Más de 60 tests de snapshot, incluidos vectores de XSS, que pasan.

**H2. Categorías e idiomas**
- CRUD de categorías (color con contraste automático, orden por arrastre y nombres por idioma).
- Ajustes de idiomas: idioma por defecto, activos y política de fallback.
- ✅ E2E: crear, renombrar, reordenar y traducir.

**H3. Editor y entradas**
- Lista de entradas (filtros por estado, idioma y búsqueda).
- Editor CodeMirror: barra, pegar o arrastrar imágenes (con `sharp`), desplegable de categorías que inserta los chips, autor, fecha y hora (programar), interruptor Published, autoguardado, pestañas por idioma con indicador, “copiar del idioma por defecto” y vista previa en vivo idéntica a la página pública.
- Borrado blando, con confirmación.
- Permisos: un editor solo edita sus propias entradas; admin y owner editan todas.
- ✅ E2E: crear una entrada en dos idiomas, programarla a +1 min y comprobar que aparece al llegar la hora sin ningún cron.

**H4. Página pública**
- SSR, listado con “cargar más”, detalle, filtro por categoría, rutas por idioma, selector de idioma, `hreflang`, RSS, OG con imagen por defecto generada, sitemap y robots, *noindex*, *show authors*, terminología, whitelabel, tema (logo y acento) y redirecciones de slug.
- ✅ Lighthouse ≥95 en rendimiento, SEO y accesibilidad; RSS válido; E2E de idioma y fallback.

**H5. Widget**
- Loader: inyección del badge, iframe en otro origen, posicionamiento según el viewport, `trigger`, `embed`, `position`, callbacks, `getUnseenCount`, reinicio para SPAs, `localStorage` con namespace, retraso, expiración, soft-hide, eyecatcher (on y progresivo), accesibilidad (foco, `Esc`, `aria`) y RTL.
- Iframe: lista y detalle con “volver”, “leer entrada completa” y textos por idioma.
- `apiMode` JSON. Modo privado con enlaces firmados.
- ✅ E2E en una página estática, una SPA React y el modo embed, **pegando el snippet original de Headway sin cambiar nada más que la URL**. Loader ≤6 KB gz.

**H6. Ajustes y equipo**
- Perfil, workspace (con cambio de slug y redirección), página pública, widget (snippet, vista previa en vivo y textos por idioma) y equipo (invitar, aceptar, cambiar rol, quitar y transferir la propiedad).
- ✅ E2E del ciclo completo de una invitación vía Mailpit.

**H7. API REST + MCP**
- Hono + `@hono/zod-openapi` en `/api/v1`, OpenAPI 3.1 y Scalar en `/api/docs`.
- API keys con scopes (pantalla Ajustes → API) y OAuth 2.1 (Better Auth).
- `Idempotency-Key`, `ETag`/`If-Match`, errores RFC 9457 y límite de peticiones por clave.
- Trazabilidad (`created_via`, actor) visible en el panel, y ajuste «las integraciones pueden publicar».
- MCP Streamable HTTP en `/mcp` y paquete stdio `@featherlog/mcp`.
- Guías para Claude Desktop, Claude Code, Cursor y ChatGPT.
- ✅ OpenAPI válida (`redocly lint`); tests de contrato por endpoint (scopes, 401/403, idempotencia, 412); E2E del MCP por HTTP y stdio: borrador → traducción → publicar falla sin el ajuste → se activa → publicar → visible en el widget y la página pública. Prueba manual con Claude Code.

**H8. Producción**
- Dockerfile multi-stage, `compose.yml` y Caddyfile; migraciones al arrancar; `/healthz`; logs con `pino`; Sentry opcional.
- Script de bootstrap del VPS, copias de seguridad a R2 y prueba de restauración.
- Pipelines de staging y producción.
- ✅ `docker compose up` en una máquina limpia deja la app funcionando en menos de 2 minutos; staging se despliega solo al fusionar.

**H9. Release v0.1**
- Documentación (self-host, configuración, widget, migración desde Headway, Markdown y arquitectura), README con capturas y GIF, CONTRIBUTING, plantillas de issues y PR, SECURITY.md y licencia.
- Nuestro changelog publicado con la propia herramienta.
- ✅ Etiqueta `v0.1.0` publicada, imagen en GHCR y demo pública funcionando.

## 14. Roadmap posterior
1. Importador desde Headway (RSS o página pública), con fusión de cuentas por idioma.
2. Webhooks salientes (sobre el outbox de eventos) y una GitHub Action que publique notas de versión desde un release usando la API.
3. Integraciones: Slack, X, Discord y email.
4. Suscriptores por email por idioma.
5. Segmentación por usuario (`token` JWT) y estado de “visto” en el servidor.
6. Analítica y reacciones.
7. Dominios propios con *on-demand TLS*.
8. Nube: Stripe y planes, GDPR, SSO, auditoría y traducción con IA.

## 15. Riesgos y notas
- **Marca:** no copiar el nombre, el logo, los textos ni el CSS de Headway. `HW_config` es solo compatibilidad técnica.
- **Seguridad:** HTML sanitizado, validación de `origin`, límite de peticiones en la API del widget y en el login, tokens firmados y cabeceras CSP. El iframe solo puede incrustarse con `frame-ancestors *`; el panel, con `frame-ancestors 'none'`.
- **URLs públicas e i18n:** quedan fijadas en H4 y no se cambian después.
- **Rendimiento del widget:** presupuesto de tamaño en CI y caché en el CDN.
