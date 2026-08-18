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

Push schema changes to the database:
```bash
npm run prisma:push
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
| `npm run prisma:migrate` | Create and apply database migrations |
| `npm run prisma:push` | Push Prisma schema state to database |
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
