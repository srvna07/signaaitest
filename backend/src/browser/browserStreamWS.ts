/* eslint-disable no-console */
import { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { JwtPayload } from '../middlewares/authenticate';
import { hasSession, sessionPath, deleteSession, saveSession } from '../browser/sessionCache';
import {
  McpAgentExplorer,
  generateTestCasesFromTranscript,
  resolveCredentials,
} from '../browser/McpAgentExplorer';

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

// ─── Auto-login via MCP agent ──────────────────────────────────────────────────

async function performMcpLogin(
  explorer: McpAgentExplorer,
  baseUrl: string,
  loginPath: string,
  username: string,
  password: string,
  ws: WebSocket,
): Promise<boolean> {
  send(ws, { type: 'status', message: 'Logging in automatically (MCP agent)...' });

  const loginUrl = new URL(loginPath, baseUrl).toString();
  const page = explorer.page;
  if (!page) return false;

  await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 });

  await page
    .waitForSelector('#username', { timeout: 15000 })
    .catch((e: Error) => console.error('[DEBUG] waitForSelector failed:', e.message));
  await page.waitForTimeout(500);

  await page
    .fill('#username', username)
    .catch((e: Error) => console.error('[DEBUG] fill username failed:', e.message));
  await page.waitForTimeout(500);
  await page
    .fill('#password', password)
    .catch((e: Error) => console.error('[DEBUG] fill password failed:', e.message));
  await page.waitForTimeout(500);

  await page.click('button[type="submit"], button:has-text("Login")').catch(async (e: Error) => {
    console.error('[DEBUG] click login button failed:', e.message);
    await page.keyboard
      .press('Enter')
      .catch((e2: Error) => console.error('[DEBUG] press Enter failed:', e2.message));
  });

  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }),
      page.waitForFunction(
        () => {
          const el =
            document.querySelector('#password') || document.querySelector('input[type="password"]');
          return !el || (el as HTMLElement).offsetParent === null;
        },
        { timeout: 15000 },
      ),
    ]);
  } catch {
    /* ignore timeout */
  }

  const passwordInput = await page.$('#password, input[type="password"]').catch(() => null);
  if (passwordInput && (await passwordInput.isVisible().catch(() => false))) {
    return false;
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

  const explorer = new McpAgentExplorer();
  let sessionUsed = false;

  // ── Pipe all frames to the WebSocket client (same as before) ──────────
  explorer.on('frame', (frameBase64: string) => {
    let currentUrl = '';
    const p = explorer.page;
    if (p) {
      try {
        currentUrl = p.url();
      } catch {
        // ignore
      }
    }
    send(ws, { type: 'frame', frame: frameBase64, url: currentUrl });
  });

  ws.on('close', () => {
    void explorer.stop();
  });

  try {
    // ── Resolve cached session if available ────────────────────────────
    const envRequiresLogin = environment.requiresLogin && useAutoLogin;
    const cachedSessionPath =
      envRequiresLogin && hasSession(environmentId) ? sessionPath(environmentId) : undefined;

    send(ws, { type: 'status', message: 'Launching browser with MCP agent...' });
    await explorer.start(cachedSessionPath);

    if (cachedSessionPath) {
      sessionUsed = true;
      send(ws, { type: 'status', message: 'Loaded cached session — skipping login.' });
    }

    // ── Resolve login credentials (NEVER sent to AI) ───────────────────
    let loginUsername = '';
    let loginPassword = '';

    if (envRequiresLogin) {
      const creds = await resolveCredentials(environment, environmentId);
      loginUsername = creds.username;
      loginPassword = creds.password;

      if (!cachedSessionPath) {
        // Perform login via direct page interaction (same proven approach as original)
        if (!loginUsername || !loginPassword) {
          send(ws, {
            type: 'error',
            message: 'Credentials cannot be empty. Please configure Auto-Login settings.',
          });
          await explorer.stop();
          ws.close();
          return;
        }

        const loginOk = await performMcpLogin(
          explorer,
          environment.baseUrl,
          environment.loginPath || '/',
          loginUsername,
          loginPassword,
          ws,
        );

        if (!loginOk) {
          send(ws, { type: 'error', message: 'Auto-login failed. Check credentials.' });
          await explorer.stop();
          ws.close();
          return;
        }

        // Log that login happened (real creds never touched the AI)
        await prisma.auditLog
          .create({
            data: {
              userId,
              action: 'mcp_auto_login',
              entityType: 'Environment',
              entityId: environmentId,
            },
          })
          .catch(() => {});

        // Save session for next time
        const page = explorer.page;
        if (page) {
          const storageState = await page.context().storageState();
          saveSession(environmentId, JSON.stringify(storageState));
        }
      }
    }

    // ── If cached session was used, verify it's still valid ───────────
    if (sessionUsed && envRequiresLogin) {
      const checkUrl = new URL(targetPath, environment.baseUrl).toString();
      const page = explorer.page;
      if (page) {
        await page.goto(checkUrl, { waitUntil: 'networkidle', timeout: 30000 });
        const passwordInput = await page.$('#password, input[type="password"]').catch(() => null);
        if (passwordInput && (await passwordInput.isVisible().catch(() => false))) {
          send(ws, { type: 'status', message: 'Cached session expired. Re-logging in...' });
          deleteSession(environmentId);
          send(ws, {
            type: 'error',
            message: 'Session expired. Please retry — a fresh login will be performed.',
          });
          await explorer.stop();
          ws.close();
          return;
        }
      }
    } else {
      const isFreshLogin = envRequiresLogin && !cachedSessionPath;
      const shouldNavigate = targetPath && targetPath !== '/';
      const page = explorer.page;

      if ((!isFreshLogin || shouldNavigate) && page) {
        const finalPath = targetPath || '/';
        send(ws, { type: 'status', message: `Navigating to ${finalPath}...` });
        const fullUrl = new URL(finalPath, environment.baseUrl).toString();
        await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      } else if (page) {
        send(ws, { type: 'status', message: 'Staying on dashboard after login...' });
      }
    }

    // ── Run MCP agentic exploration loop ───────────────────────────────
    send(ws, { type: 'status', message: 'Starting adaptive MCP exploration...' });

    const requirementText = `Title: ${requirement.title}\nDescription: ${requirement.description}`;

    const explorationResult = await explorer.explore({
      requirementText,
      baseUrl: environment.baseUrl,
      targetPath: targetPath || '/',
      scope,
      environmentId,
      loginUsername: loginUsername || undefined,
      loginPassword: loginPassword || undefined,
      onStatus: (statusMsg) => send(ws, { type: 'status', message: statusMsg }),
    });

    // ── Generate test cases from transcript ────────────────────────────
    send(ws, { type: 'status', message: 'Compiling test case suggestions from exploration...' });

    const { testCases, cutShort, cutShortReason } = await generateTestCasesFromTranscript(
      requirementText,
      explorationResult,
      scope,
    );

    // ── Capture final screenshot for the result preview ────────────────
    let finalScreenshotBase64 = '';
    const lastStopWithScreenshot = [...explorationResult.stops]
      .reverse()
      .find((s) => s.screenshotBase64);
    if (lastStopWithScreenshot?.screenshotBase64) {
      finalScreenshotBase64 = lastStopWithScreenshot.screenshotBase64;
    } else {
      // Fallback: take a PNG screenshot from page
      const page = explorer.page;
      if (page) {
        try {
          const buf = await page.screenshot({ type: 'png' });
          finalScreenshotBase64 = buf.toString('base64');
        } catch {
          /* ignore */
        }
      }
    }

    // ── Deliver results (same shape as before — no frontend changes needed) ──
    send(ws, {
      type: 'result',
      data: testCases,
      screenshot: finalScreenshotBase64
        ? `data:image/png;base64,${finalScreenshotBase64}`
        : undefined,
      explorationMeta: {
        turns: explorationResult.turns,
        cutShort,
        cutShortReason,
        inputTokens: explorationResult.totalInputTokens,
        outputTokens: explorationResult.totalOutputTokens,
        stops: explorationResult.stops.length,
      },
    });

    if (cutShort) {
      send(ws, {
        type: 'status',
        message: `⚠ Note: Exploration was cut short (${cutShortReason}). Test cases reflect the explored portion only.`,
      });
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'ws_mcp_browser_generate',
        entityType: 'Requirement',
        entityId: requirementId,
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[WS MCP browser-stream] Error:', errMsg);
    send(ws, { type: 'error', message: errMsg });
  } finally {
    await explorer.stop();
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
