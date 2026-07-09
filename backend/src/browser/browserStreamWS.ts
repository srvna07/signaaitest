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
  useAutoLogin?: boolean;
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

  // Wait for the form to actually render in the React DOM before typing!
  await stream.page.waitForSelector('#username', { timeout: 15000 }).catch(e => console.error('[DEBUG] waitForSelector failed:', e.message));
  await stream.page.waitForTimeout(500); // Visual buffer

  // Forcefully fill the exact inputs
  await stream.page.fill('#username', username).catch(e => console.error('[DEBUG] fill username failed:', e.message));
  await stream.page.waitForTimeout(500);
  await stream.page.fill('#password', password).catch(e => console.error('[DEBUG] fill password failed:', e.message));
  
  await stream.page.waitForTimeout(500);
  await stream.page.click('button[type="submit"], button:has-text("Login")').catch(async e => {
    console.error('[DEBUG] click login button failed:', e.message);
    await stream.page.keyboard.press('Enter').catch(e2 => console.error('[DEBUG] press Enter failed:', e2.message));
  });

  try {
    await Promise.race([
      stream.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }),
      stream.page.waitForFunction(() => {
        const el = document.querySelector('#password') || document.querySelector('input[type="password"]');
        return !el || (el as any).offsetParent === null;
      }, { timeout: 15000 })
    ]);
  } catch {
    /* ignore timeout */
  }

  // Check if password field is still visible (robust check for SPAs)
  const passwordInput = await stream.page.$('#password, input[type="password"]').catch(() => null);
  if (passwordInput && await passwordInput.isVisible().catch(() => false)) {
    return false; // login failed
  }

  send(ws, { type: 'status', message: 'Login successful. Caching session...' });
  return true;
}

// ─── Main orchestration ────────────────────────────────────────────────────────

async function handleSession(ws: WebSocket, msg: StartMessage, userId: string): Promise<void> {
  const {
    requirementId,
    environmentId,
    path: targetPath = '',
    scope = 'BOTH',
    useAutoLogin = true,
  } = msg;

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
    let currentUrl = '';
    try { currentUrl = stream.page.url(); } catch {}
    send(ws, { type: 'frame', frame: frameBase64, url: currentUrl });
  });

  ws.on('close', () => {
    void stream.stop();
  });

  try {
    // ── Resolve cached session if available ────────────────────────────────
    const envRequiresLogin = environment.requiresLogin && useAutoLogin;
    const cachedSessionPath =
      envRequiresLogin && hasSession(environmentId) ? sessionPath(environmentId) : undefined;

    send(ws, { type: 'status', message: 'Launching browser...' });
    await stream.start(cachedSessionPath);
    if (cachedSessionPath) {
      sessionUsed = true;
      send(ws, { type: 'status', message: 'Loaded cached session — skipping login.' });
    }

    // ── Auto-login if needed ───────────────────────────────────────────────
    if (envRequiresLogin && !cachedSessionPath) {
      const loginPath = environment.loginPath || '/';

      // Resolve secrets
      let username = '';
      let password = '';

      if (environment.loginUsernameSecret) {
        const usernameSecret = await prisma.secret.findFirst({
          where: { name: environment.loginUsernameSecret, environmentId },
        });
        if (usernameSecret) {
          username = decryptSecret(usernameSecret.encryptedValue);
        } else {
          username = environment.loginUsernameSecret; // fallback to raw string
        }
      }

      if (environment.loginPasswordSecret) {
        const passwordSecret = await prisma.secret.findFirst({
          where: { name: environment.loginPasswordSecret, environmentId },
        });
        if (passwordSecret) {
          password = decryptSecret(passwordSecret.encryptedValue);
        } else {
          password = environment.loginPasswordSecret; // fallback to raw string
        }
      }

      if (!username || !password) {
        send(ws, { type: 'error', message: 'Credentials cannot be empty. Please configure Auto-Login settings.' });
        await stream.stop();
        ws.close();
        return;
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
      // Navigate to target to check
      const checkUrl = new URL(targetPath, environment.baseUrl).toString();
      await stream.page.goto(checkUrl, { waitUntil: 'networkidle', timeout: 30000 });
      const passwordInput = await stream.page.$('#password, input[type="password"]').catch(() => null);
      if (passwordInput && await passwordInput.isVisible().catch(() => false)) {
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
      const isFreshLogin = envRequiresLogin && !cachedSessionPath;
      const shouldNavigate = targetPath && targetPath !== '/';

      if (!isFreshLogin || shouldNavigate) {
        const finalPath = targetPath || '/';
        send(ws, { type: 'status', message: `Navigating to ${finalPath}...` });
        const fullUrl = new URL(finalPath, environment.baseUrl).toString();
        await stream.page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      } else {
        send(ws, { type: 'status', message: 'Staying on dashboard after login...' });
      }
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
