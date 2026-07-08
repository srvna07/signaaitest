# Signa AI Test

A full-stack monorepo with a **Node.js + Express + TypeScript** backend and a **React + TypeScript (Vite)** frontend. PostgreSQL is used as the database via **Prisma ORM**, with **JWT** for authentication.

---

## Project Structure

```
signa-ai-test/
├── backend/              # Express + TypeScript API
│   ├── prisma/
│   │   └── schema.prisma # Database schema
│   ├── src/
│   │   ├── config/       # env validation, Prisma client
│   │   ├── middlewares/  # authenticate (JWT), errorHandler
│   │   ├── routes/       # API route definitions
│   │   ├── app.ts        # Express app factory
│   │   └── index.ts      # Server entry point
│   ├── .env.example
│   ├── .eslintrc.cjs
│   ├── .prettierrc
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/             # React + TypeScript (Vite)
│   ├── src/
│   │   ├── lib/
│   │   │   └── apiClient.ts  # Typed fetch wrapper
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .env.example
│   ├── .eslintrc.cjs
│   ├── .prettierrc
│   ├── vite.config.ts
│   └── package.json
│
├── docker-compose.yml    # PostgreSQL for local dev
└── README.md
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| Docker + Docker Compose | Latest stable |

---

## Quick Start

### 1. Start PostgreSQL via Docker

```bash
docker-compose up -d
```

This spins up a Postgres 16 container on port **5432**.

---

### 2. Set Up the Backend

```bash
cd backend

# Copy and fill in your env vars
cp .env.example .env

# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run initial DB migration
npm run prisma:migrate

# Start the dev server (port 4000)
npm run dev
```

> API will be available at `http://localhost:4000/api`
> Health check: `http://localhost:4000/api/health`

---

### 3. Set Up the Frontend

```bash
cd frontend

# Copy and fill in your env vars
cp .env.example .env

# Install dependencies
npm install

# Start the Vite dev server (port 5173)
npm run dev
```

> App will be available at `http://localhost:5173`

---

## Environment Variables

### Backend (`/backend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP port | `4000` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_SECRET` | Secret key for signing JWTs | — |
| `JWT_EXPIRES_IN` | Token expiry duration | `7d` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` |
| `LOG_LEVEL` | Morgan log level | `debug` |

### Frontend (`/frontend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API base URL | `/api` |
| `VITE_APP_NAME` | Application display name | `Signa AI Test` |
| `VITE_APP_ENV` | App environment label | `development` |

---

## Available Scripts

### Backend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot-reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
| `npm run prisma:generate` | Regenerate Prisma Client |
| `npm run prisma:migrate` | Run pending DB migrations |
| `npm run prisma:studio` | Open Prisma Studio GUI |

### Frontend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build production bundle |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Language | TypeScript 5 |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Auth | JWT (jsonwebtoken) |
| Validation | Zod |
| Frontend | React 18 + Vite 5 |
| Linting | ESLint 8 + TypeScript ESLint |
| Formatting | Prettier 3 |
| Dev DB | Docker Compose |

---

## Adding Business Logic

This is a skeleton project. To add features:

1. **Add a Prisma model** in `backend/prisma/schema.prisma`, then run `npm run prisma:migrate`.
2. **Create a route** under `backend/src/routes/`.
3. **Register the route** in `backend/src/routes/index.ts`.
4. **Add a React component** under `frontend/src/components/`.
5. **Use `apiClient`** from `frontend/src/lib/apiClient.ts` to call the backend.
