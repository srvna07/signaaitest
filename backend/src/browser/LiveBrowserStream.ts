import { EventEmitter } from 'events';
import { Browser, BrowserContext, CDPSession, Page } from 'playwright';

export type FrameCallback = (frameBase64: string) => void;

/**
 * Generic, AI-agnostic live browser streaming module.
 * Launches Chromium headless, opens a CDP session, and streams JPEG frames
 * via EventEmitter. Exposes the Playwright `page` so callers can navigate,
 * fill, and click while streaming. No AI or test-case logic lives here.
 *
 * Reusable for Phase 5 (live test execution viewing).
 */
export class LiveBrowserStream extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private cdpSession: CDPSession | null = null;
  private _page: Page | null = null;
  private started = false;

  /** The Playwright page — available after start() resolves. */
  get page(): Page {
    if (!this._page) throw new Error('LiveBrowserStream not started');
    return this._page;
  }

  /**
   * Launches the browser and begins CDP screencast.
   * Frames are emitted as 'frame' events carrying a base64 JPEG string.
   */
  async start(storageStatePath?: string): Promise<void> {
    if (this.started) throw new Error('Already started');
    this.started = true;

    const { chromium } = await import('playwright');

    this.browser = await chromium.launch({ headless: true });

    const contextOptions = storageStatePath ? { storageState: storageStatePath } : {};
    this.context = await this.browser.newContext(contextOptions);

    this._page = await this.context.newPage();
    this.cdpSession = await this._page.context().newCDPSession(this._page);

    this.cdpSession.on('Page.screencastFrame', ({ data, sessionId }) => {
      this.emit('frame', data);
      // Acknowledge each frame so the screencast keeps delivering
      void this.cdpSession?.send('Page.screencastFrameAck', { sessionId }).catch(() => {
        /* ignore ack errors during shutdown */
      });
    });

    await this.cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 80,
      everyNthFrame: 1,
    });
  }

  /** Stops screencast, CDP session, and browser. Safe to call multiple times. */
  async stop(): Promise<void> {
    try {
      if (this.cdpSession) {
        await this.cdpSession.send('Page.stopScreencast').catch(() => {
          /* ignore */
        });
        await this.cdpSession.detach().catch(() => {
          /* ignore */
        });
        this.cdpSession = null;
      }
    } catch {
      /* ignore */
    }

    try {
      if (this.context) {
        await this.context.close().catch(() => {
          /* ignore */
        });
        this.context = null;
      }
    } catch {
      /* ignore */
    }

    try {
      if (this.browser) {
        await this.browser.close().catch(() => {
          /* ignore */
        });
        this.browser = null;
      }
    } catch {
      /* ignore */
    }

    this._page = null;
    this.started = false;
    this.emit('stopped');
  }
}
