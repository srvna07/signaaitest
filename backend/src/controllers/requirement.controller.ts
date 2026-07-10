import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { GeminiProvider } from '../ai/providers/GeminiProvider';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
});

const updateSchema = createSchema.omit({ projectId: true }).partial();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function writeAuditLog(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  await prisma.auditLog.create({ data: { userId, action, entityType, entityId } });
}

/** Attach _count.testCases as a `coverage` field on each requirement row. */
function withCoverage<T extends { _count: { testCases: number } }>(
  row: T,
): Omit<T, '_count'> & { coverage: number } {
  const { _count, ...rest } = row;
  return { ...rest, coverage: _count.testCases };
}

const includeCreator = { creator: { select: { id: true, name: true, email: true } } } as const;
const includeCount = { _count: { select: { testCases: true } } } as const;

// ─── Controllers ─────────────────────────────────────────────────────────────

/** GET /api/requirements */
export async function listRequirements(req: Request, res: Response): Promise<void> {
  const projectId = req.query.projectId as string;
  const where = projectId ? { projectId } : {};

  const rows = await prisma.requirement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { ...includeCreator, ...includeCount },
  });
  res.json({ success: true, data: rows.map(withCoverage) });
}

/** GET /api/requirements/:id */
export async function getRequirement(req: Request, res: Response): Promise<void> {
  const row = await prisma.requirement.findUnique({
    where: { id: req.params.id },
    include: { ...includeCreator, ...includeCount },
  });
  if (!row) {
    res.status(404).json({ success: false, error: 'Requirement not found' });
    return;
  }
  res.json({ success: true, data: withCoverage(row) });
}

/** POST /api/requirements */
export async function createRequirement(req: Request, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const userId = req.user!.userId;
  const row = await prisma.requirement.create({
    data: { ...parsed.data, createdBy: userId },
    include: { ...includeCreator, ...includeCount },
  });

  await writeAuditLog(userId, 'create', 'Requirement', row.id);
  res.status(201).json({ success: true, data: withCoverage(row) });
}

/** PUT /api/requirements/:id */
export async function updateRequirement(req: Request, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const existing = await prisma.requirement.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Requirement not found' });
    return;
  }

  const userId = req.user!.userId;
  const row = await prisma.requirement.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: { ...includeCreator, ...includeCount },
  });

  await writeAuditLog(userId, 'update', 'Requirement', row.id);
  res.json({ success: true, data: withCoverage(row) });
}

/** DELETE /api/requirements/:id */
export async function deleteRequirement(req: Request, res: Response): Promise<void> {
  const existing = await prisma.requirement.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Requirement not found' });
    return;
  }

  const userId = req.user!.userId;
  await prisma.requirement.delete({ where: { id: req.params.id } });
  await writeAuditLog(userId, 'delete', 'Requirement', req.params.id);
  res.json({ success: true, data: { id: req.params.id } });
}

/** POST /api/requirements/:id/generate-test-cases */
export async function generateTestCases(req: Request, res: Response): Promise<void> {
  const requirementId = req.params.id;
  const existing = await prisma.requirement.findUnique({ where: { id: requirementId } });

  if (!existing) {
    res.status(404).json({ success: false, error: 'Requirement not found' });
    return;
  }

  const userId = req.user!.userId;
  await writeAuditLog(userId, 'generate_test_cases', 'Requirement', requirementId);

  // Requirement payload for AI
  const requirementText = `Title: ${existing.title}\nDescription: ${existing.description}`;

  try {
    const aiProvider = (await import('../ai/AIProviderFactory')).AIProviderFactory.getProvider();
    const suggestions = await aiProvider.generateTestCases(requirementText);

    res.json({ success: true, data: suggestions });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`AI generation failed for requirement ${requirementId}: ${msg}`);
    res.status(500).json({ success: false, error: msg || 'AI Generation failed' });
  }
}

/** POST /api/requirements/:id/generate-from-browser */
export async function generateFromBrowser(req: Request, res: Response): Promise<void> {
  const requirementId = req.params.id;

  const parsed = z
    .object({
      environmentId: z.string().uuid(),
      path: z.string().optional().default(''),
      scope: z.enum(['UI', 'API', 'BOTH']).default('BOTH'),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0]?.message });
    return;
  }

  const { environmentId, path, scope } = parsed.data;

  const [existingReq, env] = await Promise.all([
    prisma.requirement.findUnique({ where: { id: requirementId } }),
    prisma.environment.findUnique({ where: { id: environmentId } }),
  ]);

  if (!existingReq) {
    res.status(404).json({ success: false, error: 'Requirement not found' });
    return;
  }
  if (!env) {
    res.status(404).json({ success: false, error: 'Environment not found' });
    return;
  }

  const fullUrl = new URL(path, env.baseUrl).toString();
  const userId = req.user!.userId;
  await writeAuditLog(
    userId,
    'generate_from_browser',
    'Requirement',
    requirementId + ':' + fullUrl,
  );

  const requirementText = `Title: ${existingReq.title}\nDescription: ${existingReq.description}`;

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Set a timeout for navigation
    await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 });

    const screenshotBuffer = await page.screenshot({ type: 'png' });
    const screenshotBase64 = screenshotBuffer.toString('base64');

    // Extract basic interactive elements
    const domTree = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, a, input, select, textarea'));
      return elements
        .map((element) => {
          const el = element as HTMLElement;
          const tag = el.tagName.toLowerCase();
          const text =
            el.textContent?.trim().replace(/\s+/g, ' ') ||
            (el as HTMLInputElement).value ||
            (el as HTMLInputElement).placeholder ||
            '';
          const id = el.id ? `#${el.id}` : '';
          const type = (el as HTMLInputElement).type
            ? `[type="${(el as HTMLInputElement).type}"]`
            : '';
          const name = (el as HTMLInputElement).name
            ? `[name="${(el as HTMLInputElement).name}"]`
            : '';
          return `${tag}${id}${type}${name} -> "${text}"`;
        })
        .filter((str) => !str.endsWith('-> ""'))
        .join('\n');
    });

    await browser.close();

    const gemini = new GeminiProvider();

    const suggestions = await gemini.generateTestCasesFromBrowser(
      requirementText,
      screenshotBase64,
      domTree,
      scope,
    );

    let truncatedDomTree = domTree;
    if (truncatedDomTree.length > 200000) {
      truncatedDomTree = truncatedDomTree.substring(0, 200000) + '\n... [TRUNCATED - EXCEEDED MAX SIZE]';
    }

    const suggestionsWithDom = suggestions.map((s: any) => {
      if (s.type === 'UI') {
        return { ...s, domSnapshot: truncatedDomTree };
      }
      return s;
    });

    res.json({
      success: true,
      data: suggestionsWithDom,
      screenshot: `data:image/png;base64,${screenshotBase64}`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Browser generation failed for requirement ${requirementId}: ${msg}`);
    res.status(500).json({ success: false, error: msg || 'Browser Generation failed' });
  }
}
