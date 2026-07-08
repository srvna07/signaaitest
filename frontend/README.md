# Signa AI Frontend

React 18 + TypeScript + Vite 5 frontend for the Signa AI Test project.

## Getting Started

```bash
# Copy env vars
cp .env.example .env

# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Compile TS + build production bundle |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run format` | Format with Prettier |

## Environment Variables

See `.env.example` for required variables.

## Notes

- `/api/*` requests are proxied to the backend at `http://localhost:4000` in development.
- Use `src/lib/apiClient.ts` for all backend API calls.
