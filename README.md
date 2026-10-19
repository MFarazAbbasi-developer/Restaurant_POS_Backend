# Faraz POS - Backend API

Production-ready backend for **Faraz POS** (Commercial Restaurant Point of Sale & Management System).

Built with **Node.js**, **TypeScript**, **Express.js**, **PostgreSQL**, **Prisma ORM**, **Docker Compose**, **Zod**, **Pino**, **Socket.IO**, and **Vitest**.

---

## 🏗️ Architecture & Project Structure

The project follows a clean, modular architecture separating concerns across infrastructure, configuration, common utilities/middlewares, and modular business domains:

```text
restaurant_POS_backend/
├── .env.example              # Environment variables template
├── .env                      # Local environment configuration (git-ignored)
├── .gitignore                # Git ignore patterns
├── .prettierrc               # Prettier code formatting rules
├── .prettierignore           # Prettier ignore list
├── eslint.config.mjs         # ESLint flat config with TypeScript rules
├── tsconfig.json             # Strict TypeScript compiler options
├── docker-compose.yml        # PostgreSQL 16 Alpine container configuration
├── package.json              # Project scripts and dependencies
├── vitest.config.ts          # Vitest testing configuration
├── README.md                 # Project documentation
│
├── prisma/
│   └── schema.prisma         # Prisma schema and PostgreSQL datasource definition
│
├── src/
│   ├── app.ts                # Express application configuration & middleware stack
│   ├── server.ts             # Server entrypoint (HTTP + Socket.IO + Graceful shutdown)
│   │
│   ├── config/               # Infrastructure & environment configuration
│   │   ├── database.ts       # PrismaClient singleton and connection lifecycle
│   │   ├── env.ts            # Type-safe environment validation via Zod
│   │   ├── logger.ts         # Structured logging configuration with Pino
│   │   └── socket.ts         # Socket.IO server initialization
│   │
│   ├── common/               # Shared cross-cutting components
│   │   ├── errors/           # Centralized AppError and HTTP error classes
│   │   │   ├── app-error.ts
│   │   │   └── error-codes.ts
│   │   ├── http/             # Consistent HTTP status and response wrappers
│   │   │   ├── http-status.ts
│   │   │   └── response.ts
│   │   ├── middlewares/      # Express middlewares
│   │   │   ├── error.middleware.ts
│   │   │   ├── not-found.middleware.ts
│   │   │   ├── request-logger.middleware.ts
│   │   │   └── validate.middleware.ts
│   │   └── types/            # Global/common TypeScript interfaces
│   │       └── index.ts
│   │
│   ├── modules/              # Domain-driven feature modules
│   │   └── health/           # System health check module
│   │       ├── health.controller.ts
│   │       ├── health.routes.ts
│   │       └── health.service.ts
│   │
│   └── routes/               # API routes aggregation
│       └── index.ts          # Root `/api/v1` router
│
└── tests/                    # Automated tests
    ├── setup.ts              # Vitest test environment bootstrap
    └── health/
        └── health.test.ts    # Health endpoint integration tests
```

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js** >= 20.x (Recommended: Node.js 22 LTS or 24)
- **npm** >= 10.x
- **Docker** & **Docker Compose**

### 2. Installation

1. Clone or navigate to the backend repository:
   ```bash
   cd restaurant_POS_backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   ```bash
   cp .env.example .env
   ```

### 3. Start Database (PostgreSQL via Docker)

Start the PostgreSQL 16 container:
```bash
npm run docker:db:up
```

Check database container logs:
```bash
npm run docker:db:logs
```

To stop the database:
```bash
npm run docker:db:down
```

### 4. Prisma Setup

Generate the Prisma Client:
```bash
npm run prisma:generate
```

Apply versioned migrations (preferred over `db push` for shared/production-like environments):
```bash
npm run prisma:migrate:deploy
```

Push schema changes to the database (local experimentation only; not for production):
```bash
npm run prisma:push
```

**Desktop startup** runs `prisma migrate deploy` and the system seed automatically before the API starts. It never runs `prisma db push`, `prisma migrate reset`, or `prisma:seed:demo`. If migration history is missing or inconsistent, startup stops with a diagnostic message instead of attempting a destructive repair.

The HTTP server binds to `127.0.0.1` by default (`HOST`). Do not open firewall ports for the initial local-only release.

**Persistent data (Step 3):** packaged Windows installs keep customer data under `%ProgramData%\FarazPOS` (config, logs, future PostgreSQL data, backups), separate from `%ProgramFiles%\Faraz POS`. Development keeps using this repo’s `.env`. See `electron/PERSISTENT_DATA.md` in the desktop workspace.

#### Database seeding

| Goal | Command | Behavior |
| :--- | :--- | :--- |
| **Production / fresh install (safe)** | `npm run prisma:seed:system` or `npm run prisma:seed` | Idempotent upsert of the **global permission catalog only**. No restaurants, users, or demo data. Safe to re-run. |
| **Development / tests (destructive)** | `npm run prisma:seed:demo` | **TRUNCATES** all business tables, then loads the Pakistani demo restaurant, staff, menu, and sample data. Requires explicit opt-in via the demo command (sets `ALLOW_DESTRUCTIVE_SEED=1`). |

**Command change:** `npm run prisma:seed` and `prisma db seed` previously ran the destructive demo seed. They now run the **system seed** only. Use `npm run prisma:seed:demo` when you need the wipe-and-reload demo dataset.

Never run `prisma:seed:demo` against production or customer databases. Never set `ALLOW_DESTRUCTIVE_SEED=1` in production environments.

#### First-run setup (production)

After migrations (and optionally `npm run prisma:seed:system`), start the backend and open the app. When no restaurant exists:

- `GET /api/v1/setup/status` returns `{ setupRequired: true }`
- The frontend routes to `/setup` for restaurant + owner creation
- `POST /api/v1/setup` creates the first restaurant, system roles, and OWNER admin (hashed PIN/password)

Once any restaurant exists, further setup calls return HTTP 409. Concurrent setup requests are serialized with a PostgreSQL advisory lock.

Setup module tests wipe tenant tables and are gated. Against a disposable database only:

```bash
# PowerShell example
$env:DATABASE_URL = "postgresql://pos_admin:pos_password_123@localhost:5432/faraz_pos_setup_test?schema=public"
npm run test:setup
```

Open Prisma Studio (visual database manager):
```bash
npm run prisma:studio
```

### 5. Start Development Server

Run the development server with live reloading via `tsx`:
```bash
npm run dev
```

The server will be available at:
- **Root Health Check**: [http://localhost:5000/health](http://localhost:5000/health)
- **API v1 Health Check**: [http://localhost:5000/api/v1/health](http://localhost:5000/api/v1/health)

---

## 🛠️ Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start development server with live reload (`tsx watch`) |
| `npm run build` | Clean dist and compile TypeScript (`rimraf dist && tsc`) |
| `npm run start` | Run compiled production build (`node dist/server.js`) |
| `npm run test` | Run test suite with Vitest |
| `npm run test:watch` | Run tests in interactive watch mode |
| `npm run test:coverage`| Run tests with code coverage report |
| `npm run lint` | Lint codebase with ESLint |
| `npm run lint:fix` | Automatically fix ESLint warnings/errors |
| `npm run format` | Format codebase with Prettier |
| `npm run format:check`| Check code formatting without modifying files |
| `npm run prisma:generate` | Generate Prisma Client types |
| `npm run prisma:migrate` | Create and apply database migrations (`migrate dev`) |
| `npm run prisma:migrate:deploy` | Apply pending migrations (`migrate deploy` — safe for desktop/prod) |
| `npm run prisma:push` | Push Prisma schema state to database (dev only) |
| `npm run prisma:seed` | **Safe** system seed — upsert global permissions only |
| `npm run prisma:seed:system` | Same as `prisma:seed` (explicit name) |
| `npm run prisma:seed:system:runtime` | Same system seed via Node (no `tsx`; used by desktop startup) |
| `npm run prisma:seed:demo` | **Destructive** demo seed (TRUNCATE + demo data; opt-in) |
| `npm run db:check` | Connectivity probe (`SELECT 1`) for startup orchestration |
| `npm run prisma:studio` | Launch Prisma Studio GUI |
| `npm run docker:db:up` | Start PostgreSQL container in background |
| `npm run docker:db:down` | Stop and remove PostgreSQL container |
| `npm run docker:db:logs` | Follow PostgreSQL container logs |

---

## 📡 API Response Format

All API endpoints follow a consistent JSON response standard:

### Success Response
```json
{
  "success": true,
  "message": "Faraz POS Backend is operational",
  "data": {
    "status": "healthy",
    "timestamp": "2026-08-19T00:00:00.000Z",
    "uptime": 120,
    "environment": "development",
    "services": {
      "database": {
        "status": "connected",
        "latencyMs": 2
      },
      "memory": {
        "heapUsedMb": 35.4,
        "heapTotalMb": 50.1,
        "rssMb": 85.2
      }
    }
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Route GET /api/v1/unknown not found"
  }
}
```

---

## 🧩 Adding Future Business Modules

To add a new business module (e.g. `orders`), follow this modular pattern:

1. Create `src/modules/orders/`:
   - `orders.controller.ts` (HTTP request/response handling)
   - `orders.service.ts` (Core business logic & database interactions)
   - `orders.routes.ts` (Route definitions with validation middlewares)
   - `orders.schema.ts` (Zod validation schemas for body, query, params)
   - `orders.types.ts` (Module-specific types & interfaces)
2. Mount `ordersRouter` in `src/routes/index.ts`:
   ```ts
   apiRouter.use('/orders', ordersRouter);
   ```
3. Add unit and integration tests in `tests/orders/orders.test.ts`.
