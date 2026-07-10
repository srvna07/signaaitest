/* eslint-disable no-console */
/**
 * McpAgentExplorer — MCP-based agentic browser exploration engine.
 *
 * Architecture:
 *   1. We launch Chromium via Playwright with --remote-debugging-port so the browser
 *      exposes a CDP endpoint (used by LiveBrowserStream for the live preview screencast).
 *   2. We spawn the @playwright/mcp CLI as a child process (stdio transport), passing it
 *      the CDP endpoint so it attaches to the SAME browser instance.
 *   3. The backend acts as the MCP client using @modelcontextprotocol/sdk.
 *   4. An agentic loop: send requirement + page state → model chooses tool call →
 *      we intercept credential fills → execute via MCP → feed result back → repeat.
 *   5. Loop is bounded by MAX_TURNS (10) and WALL_CLOCK_TIMEOUT_MS (90 s).
 *   6. Output: exploration transcript + compiled test-case suggestions (same Zod shape).
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  GoogleGenerativeAI,
  Content,
  Part,
  Tool,
  FunctionDeclaration,
} from '@google/generative-ai';
import { z } from 'zod';
import { chromium, Browser, BrowserContext, CDPSession, Page } from 'playwright';
import { prisma } from '../config/prisma';
import { decryptSecret } from '../utils/crypto';
// Session cache helpers are used in browserStreamWS.ts via resolveCredentials helper below

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_TURNS = 10;
const WALL_CLOCK_TIMEOUT_MS = 180_000;
const CDP_PORT = 9229; // fixed port; only one exploration session runs at a time

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExplorationStop {
  turn: number;
  url: string;
  screenshotBase64?: string; // PNG base64
  domSummary?: string;
  toolUsed: string;
  toolArgs: Record<string, unknown>;
  toolResult: string;
}

export interface ExplorationResult {
  stops: ExplorationStop[];
  cutShort: boolean;
  cutShortReason?: string;
  turns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface GeneratedTestCase {
  title: string;
  type: 'UI' | 'API';
  preconditions?: string;
  steps: { order: number; action: string; expected?: string }[];
  expectedResult: string;
}

// ─── Zod schema for generated test cases ─────────────────────────────────────

const testCaseSchema = z.object({
  title: z.string(),
  type: z.enum(['UI', 'API']),
  preconditions: z.string().optional(),
  steps: z.array(
    z.object({
      order: z.number().int().positive(),
      action: z.string(),
      expected: z.string().optional(),
    }),
  ),
  expectedResult: z.string(),
});
const testCasesSchema = z.array(testCaseSchema);

// ─── Credential interception helpers ─────────────────────────────────────────

/**
 * Returns true if the field being filled looks like a credential field.
 * Checked via the selector/text passed to browser_type.
 */
function isCredentialField(selector: string): boolean {
  return /password|passwd|pwd|secret|credential/i.test(selector);
}

function isUsernameField(selector: string): boolean {
  return (
    /username|user_name|user-name|login|email|userid/i.test(selector) && !/password/i.test(selector)
  );
}

// ─── Repair truncated JSON ────────────────────────────────────────────────────

function repairTruncatedJson(raw: string): string {
  const firstBracket = raw.indexOf('[');
  if (firstBracket === -1) return raw;
  let text = raw.substring(firstBracket);
  text = text.replace(/,\s*$/, '');
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;
  for (const ch of text) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') openBraces++;
    else if (ch === '}') openBraces--;
    else if (ch === '[') openBrackets++;
    else if (ch === ']') openBrackets--;
  }
  for (let i = 0; i < openBraces; i++) text += '}';
  for (let i = 0; i < openBrackets; i++) text += ']';
  return text;
}

// ─── Main class ───────────────────────────────────────────────────────────────

export class McpAgentExplorer extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private cdpSession: CDPSession | null = null;
  private _page: Page | null = null;
  private mcpProcess: ChildProcess | null = null;
  private mcpClient: Client | null = null;

  /** Exposes the Playwright page for use by the WS handler (auto-login, session save). */
  get page(): Page | null {
    return this._page;
  }

  /** Emits 'frame' events (base64 JPEG) just like LiveBrowserStream. */
  async start(storageStatePath?: string): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [`--remote-debugging-port=${CDP_PORT}`],
    });

    const contextOptions = storageStatePath ? { storageState: storageStatePath } : {};
    this.context = await this.browser.newContext(contextOptions);
    this._page = await this.context.newPage();

    // Attach CDP screencast so LiveBrowserStream frame events work
    this.cdpSession = await this._page.context().newCDPSession(this._page);
    this.cdpSession.on('Page.screencastFrame', ({ data, sessionId }) => {
      this.emit('frame', data);
      void this.cdpSession?.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await this.cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 80,
      everyNthFrame: 1,
    });
  }

  async stop(): Promise<void> {
    // Stop screencast
    try {
      if (this.cdpSession) {
        await this.cdpSession.send('Page.stopScreencast').catch(() => {});
        await this.cdpSession.detach().catch(() => {});
        this.cdpSession = null;
      }
    } catch {
      /* ignore */
    }

    // Disconnect MCP client
    try {
      if (this.mcpClient) {
        await this.mcpClient.close().catch(() => {});
        this.mcpClient = null;
      }
    } catch {
      /* ignore */
    }

    // Kill MCP server process
    try {
      if (this.mcpProcess && !this.mcpProcess.killed) {
        this.mcpProcess.kill('SIGTERM');
        this.mcpProcess = null;
      }
    } catch {
      /* ignore */
    }

    // Close browser context and browser
    try {
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }
    } catch {
      /* ignore */
    }

    try {
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
    } catch {
      /* ignore */
    }

    this._page = null;
    this.emit('stopped');
  }

  /**
   * Connect to the @playwright/mcp server via stdio, attaching it to the browser
   * we already launched (via CDP endpoint).
   */
  private async connectMcpServer(): Promise<Client> {
    const cdpEndpoint = `http://127.0.0.1:${CDP_PORT}`;

    // Spawn the MCP server process
    this.mcpProcess = spawn(
      'npx',
      [
        '--yes',
        '@playwright/mcp@latest',
        '--cdp-endpoint',
        cdpEndpoint,
        '--headless',
        '--no-sandbox',
        '--isolated',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      },
    );

    this.mcpProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[MCP server stderr]', data.toString().trim());
    });

    this.mcpProcess.on('error', (err) => {
      console.error('[MCP server] process error:', err.message);
    });

    const transport = new StdioClientTransport({
      command: 'npx',
      args: [
        '--yes',
        '@playwright/mcp@latest',
        '--cdp-endpoint',
        cdpEndpoint,
        '--headless',
        '--no-sandbox',
        '--isolated',
      ],
      env: { ...process.env },
    });

    const client = new Client({ name: 'signa-ai-mcp-client', version: '1.0.0' });
    await client.connect(transport);
    this.mcpClient = client;

    // Kill our manual spawn since StdioClientTransport manages its own process
    try {
      if (this.mcpProcess && !this.mcpProcess.killed) {
        this.mcpProcess.kill('SIGTERM');
        this.mcpProcess = null;
      }
    } catch {
      /* ignore */
    }

    return client;
  }

  /**
   * Run the full agentic exploration loop.
   */
  async explore(opts: {
    requirementText: string;
    baseUrl: string;
    targetPath: string;
    scope: 'UI' | 'API' | 'BOTH';
    environmentId: string;
    loginUsername?: string;
    loginPassword?: string;
    userId?: string;
    onStatus?: (msg: string) => void;
  }): Promise<ExplorationResult> {
    const {
      requirementText,
      baseUrl,
      targetPath,
      scope,
      environmentId,
      loginUsername,
      loginPassword,
      userId,
      onStatus = (_msg: string): void => {},
    } = opts;

    // IMPORTANT: This flow ALWAYS uses Gemini directly, regardless of the AI_PROVIDER
    // environment variable. Reasons:
    //   1. MCP tool-calling requires the Gemini function-calling API (FunctionDeclaration +
    //      Tool schema) — Groq's OpenAI-compatible API does not expose the same interface.
    //   2. Vision (screenshot analysis) is required for multi-page exploration, which also
    //      demands a vision-capable model. Gemini 1.5 Flash satisfies both constraints.
    // If you add a second provider here in future, ensure it supports both tool-calling
    // AND vision before wiring it into this path.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is missing for MCP exploration (Gemini required)');

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = 'gemini-flash-latest';

    // ── Connect MCP server ─────────────────────────────────────────────────
    onStatus('Connecting to Playwright MCP server...');
    let mcpClient: Client;
    try {
      mcpClient = await this.connectMcpServer();
    } catch (err) {
      throw new Error(
        `Failed to start Playwright MCP server: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // ── List available MCP tools ───────────────────────────────────────────
    onStatus('Listing MCP browser tools...');
    const toolsResponse = await mcpClient.listTools();
    const mcpToolNames = toolsResponse.tools.map((t) => t.name);
    console.log('[MCP Explorer] Available tools:', mcpToolNames.join(', '));

    // Build Gemini FunctionDeclarations from MCP tool schemas
    const sanitizeSchema = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;
      if (Array.isArray(obj)) return obj.map(sanitizeSchema);
      const newObj: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Gemini API rejects these JSON Schema properties
        if (key === '$schema' || key === 'additionalProperties' || key === 'propertyNames') {
          continue;
        }
        newObj[key] = sanitizeSchema(value);
      }
      return newObj;
    };

    const geminiFunctions: FunctionDeclaration[] = toolsResponse.tools.map((t) => {
      const params = sanitizeSchema(t.inputSchema ?? {});
      return {
        name: t.name,
        description: t.description ?? '',
        parameters: params,
      };
    });

    // Add our custom done_exploring signal
    geminiFunctions.push({
      name: 'done_exploring',
      description:
        'Call this tool ONLY when you believe you have explored enough pages and ' +
        'gathered sufficient information to generate meaningful test cases for the given requirement. ' +
        'Do NOT call this prematurely — make sure you have seen all key flows.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Brief explanation of why exploration is complete.',
          },
        },
        required: ['reason'],
      },
    });

    const tools: Tool[] = [{ functionDeclarations: geminiFunctions }];

    // ── Navigate to starting URL ───────────────────────────────────────────
    const startUrl = new URL(targetPath || '/', baseUrl).toString();
    onStatus(`Navigating to ${startUrl}...`);

    try {
      await mcpClient.callTool({
        name: 'browser_navigate',
        arguments: { url: startUrl },
      });
    } catch {
      // Fallback to page navigation if MCP tool fails
      if (this._page) {
        await this._page
          .goto(startUrl, { waitUntil: 'networkidle', timeout: 30000 })
          .catch(() => {});
      }
    }

    // ── System prompt ──────────────────────────────────────────────────────
    const scopeInstruction =
      scope === 'UI'
        ? 'Focus ONLY on UI test cases.'
        : scope === 'API'
          ? 'Focus ONLY on API test cases.'
          : 'Generate both UI and API test cases where appropriate.';

    const systemPrompt = `You are a QA automation expert conducting an adaptive browser exploration session.

YOUR TASK:
Explore the web application to gather information needed to generate test cases for ONE specific requirement:
${requirementText}

${scopeInstruction}

EXPLORATION RULES:
- Stay STRICTLY scoped to the requirement above. Ignore unrelated pages, footers, or navigation.
- Use browser tools to navigate, click, take screenshots, and inspect page elements.
- After each action, observe what changed and decide the next logical step.
- When you have seen all relevant flows for this requirement, call done_exploring.
- You have a maximum of ${MAX_TURNS} turns — use them wisely.

CREDENTIAL HANDLING:
- If you see a login form and need to log in, call browser_type for the username and password fields.
- The system will automatically intercept credential fills and inject real values — you do NOT need to know the actual credentials.
- Just describe the field naturally (e.g. selector "#username" or "input[type=password]").

DONE SIGNAL:
- Call done_exploring when you are confident you have explored enough.
- If bounds are hit before you call done_exploring, test cases will still be generated from what was explored.`;

    // ── Agentic loop ───────────────────────────────────────────────────────
    const stops: ExplorationStop[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let cutShort = false;
    let cutShortReason = '';
    let doneExploring = false;

    const history: Content[] = [{ role: 'user', parts: [{ text: systemPrompt }] }];

    const wallClockStart = Date.now();

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      // Wall-clock timeout check
      if (Date.now() - wallClockStart > WALL_CLOCK_TIMEOUT_MS) {
        cutShort = true;
        cutShortReason = `Wall-clock timeout of ${WALL_CLOCK_TIMEOUT_MS / 1000}s exceeded`;
        onStatus(`⏱ Exploration stopped: ${cutShortReason}`);
        break;
      }

      onStatus(`Turn ${turn}/${MAX_TURNS}: Asking AI what to do next...`);

      // ── Take snapshot to provide current page context ──────────────────
      let snapshotText = '';
      try {
        const snapshotResult = await mcpClient.callTool({
          name: 'browser_snapshot',
          arguments: {},
        });
        const content = snapshotResult.content as Array<{ type: string; text?: string }>;
        snapshotText = content
          .map((c) => c.text ?? '')
          .join('\n')
          .substring(0, 4000);
      } catch (snapErr) {
        snapshotText = `[Snapshot failed: ${snapErr instanceof Error ? snapErr.message : String(snapErr)}]`;
      }

      let currentUrl = 'unknown';
      if (this._page) {
        try {
          currentUrl = this._page.url();
        } catch {
          /* ignore */
        }
      }

      // ── Ask Gemini for next action ─────────────────────────────────────
      history.push({
        role: 'user',
        parts: [
          {
            text:
              `Current URL: ${currentUrl}\n\nPage snapshot:\n${snapshotText}\n\n` +
              `Turn ${turn} of ${MAX_TURNS}. Choose your next action. ` +
              (turn >= MAX_TURNS - 1
                ? 'You are near the turn limit — call done_exploring if you have enough information.'
                : ''),
          },
        ],
      });

      const model = genAI.getGenerativeModel({
        model: modelName,
        tools,
      });

      let modelResponse;
      try {
        modelResponse = await model.generateContent({ contents: history });
      } catch (aiErr) {
        cutShort = true;
        cutShortReason = `AI call failed: ${aiErr instanceof Error ? aiErr.message : String(aiErr)}`;
        onStatus(`❌ AI error on turn ${turn}: ${cutShortReason}`);
        break;
      }

      const candidate = modelResponse.response.candidates?.[0];
      if (!candidate) {
        cutShort = true;
        cutShortReason = 'No candidate returned by AI model';
        break;
      }

      // Track token usage
      const usage = modelResponse.response.usageMetadata;
      if (usage) {
        totalInputTokens += usage.promptTokenCount ?? 0;
        totalOutputTokens += usage.candidatesTokenCount ?? 0;
      }

      // Add model response to history
      history.push({ role: 'model', parts: candidate.content.parts });

      // Check for function call
      const functionCall = candidate.content.parts.find((p: Part) => 'functionCall' in p);
      if (!functionCall || !('functionCall' in functionCall)) {
        // Model returned text — treat as done
        onStatus('Model did not call a tool — finishing exploration.');
        doneExploring = true;
        break;
      }

      const fc = (functionCall as { functionCall: { name: string; args: Record<string, unknown> } })
        .functionCall;
      const toolName = fc.name;
      const toolArgs = fc.args ?? {};

      onStatus(`Turn ${turn}: AI chose → ${toolName}`);
      // SECURITY: Never log toolArgs directly — if this is browser_type, args may contain
      // the model's guess at a credential value. Instead log a redacted view.
      const logSafeArgs =
        toolName === 'browser_type' ? { ...toolArgs, text: '[REDACTED for security]' } : toolArgs;
      console.log(`[MCP Explorer] Turn ${turn}: ${toolName}`, JSON.stringify(logSafeArgs));

      // ── done_exploring signal ──────────────────────────────────────────
      if (toolName === 'done_exploring') {
        doneExploring = true;
        onStatus(`✅ AI signalled done: ${String(toolArgs.reason ?? '')}`);
        // Return a fake function response
        history.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'done_exploring',
                response: { result: 'Acknowledged. Proceeding to generate test cases.' },
              },
            },
          ],
        });
        break;
      }

      // ── Credential interception ────────────────────────────────────────
      let actualArgs = { ...toolArgs };
      let credentialIntercepted = false;

      if (toolName === 'browser_type' && typeof toolArgs.text === 'string') {
        // @playwright/mcp uses 'ref' (a numeric snapshot ref) and 'element' (a human-readable
        // description string like "Password input" or "Username field"). We check ALL of them
        // so detection works regardless of which the model populates.
        const refStr = String(toolArgs.ref ?? '');
        const elementStr = String(toolArgs.element ?? '');
        const selectorStr = String(toolArgs.selector ?? '');
        const targetStr = String(toolArgs.target ?? '');
        const combinedHint = `${refStr} ${elementStr} ${selectorStr} ${targetStr}`;

        if (isCredentialField(combinedHint) && loginPassword) {
          actualArgs = { ...toolArgs, text: loginPassword };
          credentialIntercepted = true;
          console.log('[MCP Explorer] SECURITY: Intercepted password fill (browser_type) — real value injected from vault');
          if (userId) {
            await prisma.auditLog.create({
              data: { userId, action: 'mcp_credential_intercept', entityType: 'Environment', entityId: environmentId },
            }).catch((e) => console.error('[MCP Explorer] AuditLog error:', e.message));
          }
        } else if (isUsernameField(combinedHint) && loginUsername) {
          actualArgs = { ...toolArgs, text: loginUsername };
          credentialIntercepted = true;
          console.log('[MCP Explorer] SECURITY: Intercepted username fill (browser_type) — real value injected from vault');
          if (userId) {
            await prisma.auditLog.create({
              data: { userId, action: 'mcp_credential_intercept', entityType: 'Environment', entityId: environmentId },
            }).catch((e) => console.error('[MCP Explorer] AuditLog error:', e.message));
          }
        }
      } else if (toolName === 'browser_fill_form' && Array.isArray(toolArgs.fields)) {
        let interceptedAny = false;
        const newFields = toolArgs.fields.map((f: any) => {
          const fHint = `${f.name ?? ''} ${f.target ?? ''} ${f.element ?? ''}`;
          if (isCredentialField(fHint) && loginPassword) {
            interceptedAny = true;
            console.log('[MCP Explorer] SECURITY: Intercepted password fill (browser_fill_form) — real value injected from vault');
            return { ...f, value: loginPassword };
          }
          if (isUsernameField(fHint) && loginUsername) {
            interceptedAny = true;
            console.log('[MCP Explorer] SECURITY: Intercepted username fill (browser_fill_form) — real value injected from vault');
            return { ...f, value: loginUsername };
          }
          return f;
        });

        if (interceptedAny) {
          actualArgs = { ...toolArgs, fields: newFields };
          credentialIntercepted = true;
          if (userId) {
            await prisma.auditLog.create({
              data: { userId, action: 'mcp_credential_intercept', entityType: 'Environment', entityId: environmentId },
            }).catch((e) => console.error('[MCP Explorer] AuditLog error:', e.message));
          }
        }
      }

      // ── Execute MCP tool call ──────────────────────────────────────────
      let toolResultText = '';
      let screenshotBase64: string | undefined;

      try {
        const result = await mcpClient.callTool({ name: toolName, arguments: actualArgs });
        const content = result.content as Array<{
          type: string;
          text?: string;
          data?: string;
          mimeType?: string;
        }>;

        for (const item of content) {
          if (item.type === 'text') {
            toolResultText += item.text ?? '';
          } else if (item.type === 'image' && item.data) {
            screenshotBase64 = item.data;
          }
        }

        if (credentialIntercepted) {
          // SECURITY: Overwrite any tool result that might echo back the credential value.
          // The model only ever sees this placeholder — never the real credential.
          toolResultText = 'credential entered';
        }

        toolResultText = toolResultText.substring(0, 2000);
      } catch (toolErr) {
        toolResultText = `[Tool error: ${toolErr instanceof Error ? toolErr.message : String(toolErr)}]`;
        console.error(`[MCP Explorer] Tool error for ${toolName}:`, toolErr);
      }

      // Capture current URL after action
      let urlAfterAction = currentUrl;
      if (this._page) {
        try {
          urlAfterAction = this._page.url();
        } catch {
          /* ignore */
        }
      }

      // Capture DOM summary
      let domSummary: string | undefined;
      if (this._page) {
        try {
          domSummary = await this._page.evaluate(() => {
            const elements = Array.from(
              document.querySelectorAll('button, a, input, select, textarea'),
            );
            return elements
              .map((el) => {
                const htmlEl = el as HTMLElement;
                const inputEl = el as HTMLInputElement;
                const tag = htmlEl.tagName.toLowerCase();
                const text =
                  htmlEl.textContent?.trim().replace(/\s+/g, ' ') || inputEl.placeholder || '';
                const idStr = htmlEl.id ? `#${htmlEl.id}` : '';
                const typeStr = inputEl.type ? `[type="${inputEl.type}"]` : '';
                return `${tag}${idStr}${typeStr} -> "${text}"`;
              })
              .filter((s) => !s.endsWith('-> ""'))
              .slice(0, 80)
              .join('\n');
          });
        } catch {
          /* ignore */
        }
      }

      stops.push({
        turn,
        url: urlAfterAction,
        screenshotBase64,
        domSummary,
        toolUsed: toolName,
        // SECURITY: In the saved stop transcript, always redact the text arg for intercepted
        // credential fills so the real value never appears in logs or the exploration result.
        toolArgs: credentialIntercepted ? { ...toolArgs, text: '[REDACTED-credential]' } : toolArgs,
        toolResult: toolResultText,
      });

      // Feed result back to model
      history.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: toolName,
              response: { result: toolResultText },
            },
          },
        ],
      });
    }

    if (!doneExploring && !cutShort) {
      cutShort = true;
      cutShortReason = `Reached maximum turn limit of ${MAX_TURNS}`;
      onStatus(`⚠ Exploration cut short: ${cutShortReason}`);
    }

    // ── Log cost metrics ───────────────────────────────────────────────────
    const elapsedMs = Date.now() - wallClockStart;
    console.log(
      `[MCP Explorer] Session complete — turns: ${stops.length}, ` +
        `inputTokens: ${totalInputTokens}, outputTokens: ${totalOutputTokens}, ` +
        `elapsedMs: ${elapsedMs}, cutShort: ${cutShort}` +
        (cutShortReason ? `, reason: ${cutShortReason}` : ''),
    );

    return {
      stops,
      cutShort,
      cutShortReason: cutShort ? cutShortReason : undefined,
      turns: stops.length,
      totalInputTokens,
      totalOutputTokens,
    };
  }
}

// ─── Test-case generation from exploration transcript ─────────────────────────

export async function generateTestCasesFromTranscript(
  requirementText: string,
  result: ExplorationResult,
  scope: 'UI' | 'API' | 'BOTH',
): Promise<{ testCases: GeneratedTestCase[]; cutShort: boolean; cutShortReason?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-latest',
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
    },
  });

  const scopeInstruction =
    scope === 'UI'
      ? 'Only generate UI test cases.'
      : scope === 'API'
        ? 'Only generate API test cases.'
        : 'Generate both UI and API test cases where appropriate.';

  const transcriptSummary = result.stops
    .map(
      (s) =>
        `Turn ${s.turn} — URL: ${s.url}\n  Tool: ${s.toolUsed}\n  Args: ${JSON.stringify(s.toolArgs)}\n  Result: ${s.toolResult}\n  DOM: ${s.domSummary?.substring(0, 400) ?? '(not captured)'}`,
    )
    .join('\n\n');

  const cutShortNote = result.cutShort
    ? `\n\nNOTE: Exploration was cut short (${result.cutShortReason}). Generate test cases from the explored pages only.`
    : '';

  const prompt = `You are a QA automation expert. Your task is STRICTLY LIMITED to generating test cases for the ONE specific requirement below. Do NOT generate test cases for unrelated functionality.

${scopeInstruction}

FOCUS REQUIREMENT:
${requirementText}

EXPLORATION TRANSCRIPT (${result.turns} turns):
${transcriptSummary}${cutShortNote}

IMPORTANT RULES:
- Only generate test cases for functionality DIRECTLY related to the requirement.
- Base your test cases on the ACTUAL pages and elements observed in the transcript.
- Include realistic selectors, button labels, and field names from the exploration.
- Do NOT make assumptions about elements not seen during exploration.

Output MUST be a JSON array conforming exactly to this structure:
[
  {
    "title": "A short descriptive title",
    "type": "UI" or "API",
    "preconditions": "Optional preconditions",
    "steps": [
      {
        "order": 1,
        "action": "What to do",
        "expected": "Optional expected outcome"
      }
    ],
    "expectedResult": "The final expected result"
  }
]`;

  const response = await model.generateContent(prompt);
  let text = response.response.text();
  text = repairTruncatedJson(text);

  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    text = text.substring(firstBracket, lastBracket + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Failed to parse AI test case response as JSON');
  }

  const validated = testCasesSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`AI generated invalid test case structure: ${validated.error.message}`);
  }

  return {
    testCases: validated.data as GeneratedTestCase[],
    cutShort: result.cutShort,
    cutShortReason: result.cutShortReason,
  };
}

// ─── Credential resolution helper (shared with main WS handler) ───────────────

export async function resolveCredentials(
  environment: {
    loginUsernameSecret?: string | null;
    loginPasswordSecret?: string | null;
  },
  environmentId: string,
): Promise<{ username: string; password: string }> {
  let username = '';
  let password = '';

  if (environment.loginUsernameSecret) {
    const s = await prisma.secret.findFirst({
      where: { name: environment.loginUsernameSecret, environmentId },
    });
    username = s ? decryptSecret(s.encryptedValue) : environment.loginUsernameSecret;
  }

  if (environment.loginPasswordSecret) {
    const s = await prisma.secret.findFirst({
      where: { name: environment.loginPasswordSecret, environmentId },
    });
    password = s ? decryptSecret(s.encryptedValue) : environment.loginPasswordSecret;
  }

  return { username, password };
}
