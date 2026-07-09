/* eslint-disable no-console */
import { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { JwtPayload } from '../middlewares/authenticate';
import { decryptSecret } from '../utils/crypto';
import { LiveBrowserStream } from '../browser/LiveBrowserStream';
import { hasSession, sessionPath, deleteSession, saveSession } from '../browser/sessionCache';
import { GeminiProvider } from '../ai/providers/GeminiProvider';

// ─── Message shapes ────────────────────────────────────────────────────────────

interface StartMessage {
  type: 'start';
  requirementId: string;
  environmentId: string;
  path?: string;
  scope?: 'UI' | 'API' | 'BOTH';
}

function send(ws: WebSocket, payload: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// ─── JWT auth from query string ────────────────────────────────────────────────

function authenticateRequest(req: IncomingMessage): JwtPayload | null {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) return null;
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

// ─── Auto-login helper ─────────────────────────────────────────────────────────

async function performLogin(
  stream: LiveBrowserStream,
  baseUrl: string,
  loginPath: string,
  username: string,
  password: string,
  ws: WebSocket,
): Promise<boolean> {
  send(ws, { type: 'status', message: 'Logging in automatically...' });
  const loginUrl = new URL(loginPath, baseUrl).toString();
  await stream.page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 });

  // Generic login: fill the first email/username and password input, then submit
  await stream.page
    .fill(
      'input[type="email"], input[name="email"], input[name="username"], input[type="text"]',
      username,
    )
    .catch(() => {
      /* ignore */
    });
  await stream.page.fill('input[type="password"]', password).catch(() => {
    /* ignore */
  });
  await stream.page.keyboard.press('Enter');

  try {
    await stream.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
  } catch {
    /* navigation might not happen */
  }

  // Check if still on login page
  const currentUrl = stream.page.url();
  if (currentUrl.includes(loginPath)) {
    return false; // login failed
  }

  send(ws, { type: 'status', message: 'Login successful. Caching session...' });
  return true;
}

// ─── Main orchestration ────────────────────────────────────────────────────────

async function handleSession(ws: WebSocket, msg: StartMessage, userId: string): Promise<void> {
  const { requirementId, environmentId, path: targetPath = '', scope = 'BOTH' } = msg;

  const [requirement, environment] = await Promise.all([
    prisma.requirement.findUnique({ where: { id: requirementId } }),
    prisma.environment.findUnique({ where: { id: environmentId } }),
  ]);

  if (!requirement) {
    send(ws, { type: 'error', message: 'Requirement not found' });
    ws.close();
    return;
  }
  if (!environment) {
    send(ws, { type: 'error', message: 'Environment not found' });
    ws.close();
    return;
  }

  const stream = new LiveBrowserStream();
  let sessionUsed = false;

  // Pipe all frames to the WebSocket client
  stream.on('frame', (frameBase64: string) => {
    send(ws, { type: 'frame', frame: frameBase64 });
  });

  ws.on('close', () => {
    void stream.stop();
  });

  try {
    // ── Resolve cached session if available ────────────────────────────────
    const envRequiresLogin = environment.requiresLogin;
    const cachedSessionPath = hasSession(environmentId) ? sessionPath(environmentId) : undefined;

    send(ws, { type: 'status', message: 'Launching browser...' });
    await stream.start(cachedSessionPath);
    if (cachedSessionPath) {
      sessionUsed = true;
      send(ws, { type: 'status', message: 'Loaded cached session — skipping login.' });
    }

    // ── Auto-login if needed ───────────────────────────────────────────────
    if (envRequiresLogin && !cachedSessionPath) {
      const loginPath = environment.loginPath ?? '/login';

      // Resolve secrets
      let username = '';
      let password = '';

      if (environment.loginUsernameSecret) {
        const usernameSecret = await prisma.secret.findFirst({
          where: { name: environment.loginUsernameSecret, environmentId },
        });
        if (usernameSecret) username = decryptSecret(usernameSecret.encryptedValue);
      }

      if (environment.loginPasswordSecret) {
        const passwordSecret = await prisma.secret.findFirst({
          where: { name: environment.loginPasswordSecret, environmentId },
        });
        if (passwordSecret) password = decryptSecret(passwordSecret.encryptedValue);
      }

      const loginOk = await performLogin(
        stream,
        environment.baseUrl,
        loginPath,
        username,
        password,
        ws,
      );
      if (!loginOk) {
        send(ws, { type: 'error', message: 'Auto-login failed. Check credentials.' });
        await stream.stop();
        ws.close();
        return;
      }

      // Save session
      const storageState = await stream.page.context().storageState();
      saveSession(environmentId, JSON.stringify(storageState));
    }

    // ── If cached session was used, verify we are NOT on the login page ───
    if (sessionUsed && envRequiresLogin) {
      const loginPath = environment.loginPath ?? '/login';
      // Navigate to target to check
      const checkUrl = new URL(targetPath, environment.baseUrl).toString();
      await stream.page.goto(checkUrl, { waitUntil: 'networkidle', timeout: 30000 });
      const currentUrl = stream.page.url();
      if (currentUrl.includes(loginPath)) {
        send(ws, { type: 'status', message: 'Cached session expired. Re-logging in...' });
        deleteSession(environmentId);
        // We can't re-start stream, so close and let caller retry
        send(ws, {
          type: 'error',
          message: 'Session expired. Please retry — a fresh login will be performed.',
        });
        await stream.stop();
        ws.close();
        return;
      }
    } else {
      // Navigate to target path
      send(ws, { type: 'status', message: `Navigating to ${targetPath || '/'}...` });
      const fullUrl = new URL(targetPath, environment.baseUrl).toString();
      await stream.page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 });
    }

    send(ws, { type: 'status', message: 'Page loaded. Taking screenshot and analysing...' });

    // ── Capture page data for AI ───────────────────────────────────────────
    const screenshotBuffer = await stream.page.screenshot({ type: 'png' });
    const screenshotBase64 = screenshotBuffer.toString('base64');

    const domTree = await stream.page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, a, input, select, textarea'));
      return elements
        .map((el) => {
          const htmlEl = el as HTMLElement;
          const inputEl = el as HTMLInputElement;
          const tag = htmlEl.tagName.toLowerCase();
          const text =
            htmlEl.textContent?.trim().replace(/\s+/g, ' ') ||
            inputEl.value ||
            inputEl.placeholder ||
            '';
          const idStr = htmlEl.id ? `#${htmlEl.id}` : '';
          const typeStr = inputEl.type ? `[type="${inputEl.type}"]` : '';
          const nameStr = inputEl.name ? `[name="${inputEl.name}"]` : '';
          return `${tag}${idStr}${typeStr}${nameStr} -> "${text}"`;
        })
        .filter((s) => !s.endsWith('-> ""'))
        .join('\n');
    });

    // ── Call Gemini (vision required) ─────────────────────────────────────
    send(ws, { type: 'status', message: 'Sending to AI for analysis...' });
    const gemini = new GeminiProvider();
    const requirementText = `Title: ${requirement.title}\nDescription: ${requirement.description}`;

    const suggestions = await gemini.generateTestCasesFromBrowser(
      requirementText,
      screenshotBase64,
      domTree,
      scope,
    );

    // ── Deliver results ────────────────────────────────────────────────────
    send(ws, {
      type: 'result',
      data: suggestions,
      screenshot: `data:image/png;base64,${screenshotBase64}`,
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'ws_browser_generate',
        entityType: 'Requirement',
        entityId: requirementId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[WS browser-stream] Error:', msg);
    send(ws, { type: 'error', message: msg });
  } finally {
    await stream.stop();
    ws.close();
  }
}

// ─── WebSocket server bootstrap ────────────────────────────────────────────────

export function attachBrowserStreamWS(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/browser-stream' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const user = authenticateRequest(req);
    if (!user) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    ws.once('message', (rawData) => {
      try {
        const rawStr = Buffer.isBuffer(rawData)
          ? rawData.toString('utf-8')
          : Array.isArray(rawData)
            ? Buffer.concat(rawData).toString('utf-8')
            : rawData instanceof ArrayBuffer
              ? Buffer.from(rawData).toString('utf-8')
              : String(rawData);
        const msg = JSON.parse(rawStr) as StartMessage;
        if (msg.type !== 'start') {
          send(ws, { type: 'error', message: 'First message must be {type:"start",...}' });
          ws.close();
          return;
        }
        void handleSession(ws, msg, user.userId);
      } catch {
        send(ws, { type: 'error', message: 'Invalid JSON message' });
        ws.close();
      }
    });
  });

  return wss;
}
