import JSZip from 'jszip';
import esbuild from 'esbuild';
import path from 'node:path';
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../src/db/index.ts';
import { builderProjects } from '../../src/db/schema.ts';
import { requireAuth, type AuthRequest } from '../../src/middleware/auth.ts';
import { generateTextUnary } from '../ai/adapters.ts';

const router = Router();

const ALLOWED_PACKAGES = new Set([
  'react',
  'react-dom',
  'lucide-react',
  'clsx',
  'tailwind-merge',
]);

export function validateVirtualFilePath(filePath: string): string {
  const normalized = path.posix.normalize(filePath).replace(/^\/+/, '');
  if (!normalized || normalized.startsWith('..') || normalized.includes('/../')) {
    throw new Error(`Invalid workspace file path: ${filePath}`);
  }
  return normalized;
}

export function checkSecretLeakage(files: Record<string, string>): string[] {
  const violations: string[] = [];
  const patterns = [/GEMINI_API_KEY/, /SQL_PASSWORD/, /SQL_ADMIN_PASSWORD/, /AIza[0-9A-Za-z\-_]{20,}/];
  for (const [fname, content] of Object.entries(files)) {
    for (const pat of patterns) {
      if (pat.test(content)) {
        violations.push(`Potential secret reference in ${fname}`);
      }
    }
  }
  return violations;
}

export async function compileVirtualWorkspace(files: Record<string, string>): Promise<{
  ok: boolean;
  logs: string;
  previewHtml: string;
  warnings: string[];
}> {
  const warnings = checkSecretLeakage(files);
  if (warnings.length > 0) {
    return {
      ok: false,
      logs: `Security check blocked build:\n${warnings.join('\n')}`,
      previewHtml: '',
      warnings,
    };
  }

  // Validate package.json dependencies if present
  if (files['package.json']) {
    try {
      const pkg = JSON.parse(files['package.json']);
      const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
      for (const dep of deps) {
        if (!ALLOWED_PACKAGES.has(dep) && !dep.startsWith('@types/')) {
          warnings.push(`Package "${dep}" is outside the sandbox CDN allowlist and will be stubbed/externalized.`);
        }
      }
    } catch {
      return {
        ok: false,
        logs: 'Syntax error in package.json: invalid JSON.',
        previewHtml: '',
        warnings,
      };
    }
  }

  const entryCandidate =
    files['src/main.tsx']
      ? 'src/main.tsx'
      : files['src/App.tsx']
        ? 'src/App.tsx'
        : files['index.tsx']
          ? 'index.tsx'
          : null;

  if (!entryCandidate) {
    // Fallback for plain HTML/CSS/JS project
    const html = files['index.html'] || '<!doctype html><html><body><h1>Empty Project</h1></body></html>';
    const css = files['styles.css'] || files['style.css'] || '';
    const js = files['app.js'] || files['main.js'] || '';
    const combined = html
      .replace('</head>', `<style>${css}</style></head>`)
      .replace('</body>', `<script type="module">${js}</script></body>`);
    return {
      ok: true,
      logs: 'Static HTML/CSS/JS bundle verified.',
      previewHtml: combined,
      warnings,
    };
  }

  const normalizedFiles: Record<string, string> = {};
  for (const [k, v] of Object.entries(files)) {
    normalizedFiles[validateVirtualFilePath(k)] = v;
  }

  // Wrap App.tsx automatically if src/main.tsx is absent
  const virtualEntry = '__virtual_entry__.tsx';
  if (!normalizedFiles['src/main.tsx'] && normalizedFiles['src/App.tsx']) {
    normalizedFiles[virtualEntry] = `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import App from './src/App.tsx';
      const el = document.getElementById('root');
      if (el) createRoot(el).render(<App />);
    `;
  } else {
    normalizedFiles[virtualEntry] = normalizedFiles[entryCandidate];
  }

  const virtualPlugin: esbuild.Plugin = {
    name: 'sub-ai-virtual-fs',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.path === virtualEntry) {
          return { path: virtualEntry, namespace: 'virtual' };
        }
        if (args.path.endsWith('.css')) {
          return { path: args.path, namespace: 'virtual-css' };
        }
        if (args.path === 'react' || args.path === 'react-dom' || args.path === 'react-dom/client' || args.path === 'lucide-react') {
          return { path: args.path, external: true };
        }
        if (args.path.startsWith('.') || args.path.startsWith('/')) {
          const baseDir = args.importer && args.importer !== virtualEntry
            ? path.posix.dirname(args.importer)
            : args.importer === virtualEntry && !normalizedFiles['src/main.tsx']
              ? '.'
              : path.posix.dirname(entryCandidate);
          const candidate = path.posix.normalize(path.posix.join(baseDir, args.path)).replace(/^\/+/, '');
          const exts = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];
          for (const ext of exts) {
            if (normalizedFiles[candidate + ext] !== undefined) {
              return { path: candidate + ext, namespace: 'virtual' };
            }
          }
        }
        return { path: args.path, external: true };
      });

      build.onLoad({ filter: /.*/, namespace: 'virtual-css' }, () => ({
        contents: '',
        loader: 'js',
      }));

      build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
        const contents = normalizedFiles[args.path];
        if (contents === undefined) {
          return { errors: [{ text: `File not found in virtual workspace: ${args.path}` }] };
        }
        const ext = path.posix.extname(args.path);
        const loader =
          ext === '.ts' ? 'ts' : ext === '.jsx' ? 'jsx' : ext === '.js' ? 'js' : 'tsx';
        return { contents, loader };
      });
    },
  };

  try {
    const result = await esbuild.build({
      entryPoints: [virtualEntry],
      bundle: true,
      write: false,
      format: 'esm',
      jsx: 'automatic',
      platform: 'browser',
      target: 'es2020',
      plugins: [virtualPlugin],
    });

    const bundledJs = result.outputFiles?.[0]?.text || '';
    const customCss = normalizedFiles['src/index.css'] || normalizedFiles['src/styles.css'] || '';
    const safeCss = customCss.replace(/@import\s+["']tailwindcss["'];?/g, '');

    const previewHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script type="importmap">
    {
      "imports": {
        "react": "https://esm.sh/react@19.0.0",
        "react-dom": "https://esm.sh/react-dom@19.0.0",
        "react-dom/client": "https://esm.sh/react-dom@19.0.0/client",
        "react/jsx-runtime": "https://esm.sh/react@19.0.0/jsx-runtime",
        "lucide-react": "https://esm.sh/lucide-react@0.475.0?external=react"
      }
    }
  </script>
  <style>${safeCss}</style>
</head>
<body class="bg-slate-950 text-slate-100 antialiased">
  <div id="root"></div>
  <div id="preview-error" style="display:none;padding:16px;background:#450a0a;color:#fecaca;font-family:monospace;font-size:13px;"></div>
  <script>
    window.addEventListener('error', (e) => {
      const box = document.getElementById('preview-error');
      if (box) { box.style.display = 'block'; box.textContent = 'Runtime error: ' + e.message; }
    });
  </script>
  <script type="module">
${bundledJs.replaceAll('</script>', '<\\/script>')}
  </script>
</body>
</html>`;

    return {
      ok: true,
      logs: `Build succeeded (${bundledJs.length} bytes bundled via isolated esbuild virtual sandbox).`,
      previewHtml,
      warnings,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      logs: `Build failed:\n${errMsg}`,
      previewHtml: '',
      warnings,
    };
  }
}

router.get('/builder', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const list = await db
      .select()
      .from(builderProjects)
      .where(eq(builderProjects.userId, u.id))
      .orderBy(desc(builderProjects.updatedAt))
      .limit(50);
    res.json({ projects: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list app builder projects.' });
  }
});

const generateBuilderSchema = z.object({
  prompt: z.string().min(5).max(6000),
  existingProjectId: z.number().int().positive().optional(),
  projectId: z.number().int().positive().nullable().optional(),
  model: z.string().max(120).optional(),
});

router.post('/builder/generate', requireAuth, async (req: AuthRequest, res) => {
  const parsed = generateBuilderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Describe the website or application to build.' });
    return;
  }

  const u = req.dbUser!;
  const modelId = parsed.data.model || 'gemini-4-hydrogen';

  try {
    let existingProject = null;
    if (parsed.data.existingProjectId) {
      const rows = await db
        .select()
        .from(builderProjects)
        .where(
          and(
            eq(builderProjects.id, parsed.data.existingProjectId),
            eq(builderProjects.userId, u.id),
          ),
        )
        .limit(1);
      existingProject = rows[0] ?? null;
    }

    const contextSection = existingProject
      ? `Existing files to modify/extend:\n${JSON.stringify(existingProject.filesJson, null, 2)}`
      : 'Create a complete new React + TypeScript + Tailwind CSS project.';

    const genPrompt = `You are a principal full-stack web architect building a real, runnable React + TypeScript + Tailwind CSS application.
Only import from 'react', 'react-dom/client', 'lucide-react', or relative './' files you create.
Include 'package.json', 'index.html', 'src/index.css', 'src/App.tsx', and clean modular components under 'src/components/'.
Make sure all interactive state (cart, filters, forms, tabs, modals) works completely in the browser with rich domain content and responsive desktop/tablet/mobile Tailwind classes.
Return ONLY valid JSON matching:
{
  "name": "Short App Name",
  "planMarkdown": "Brief architecture & file plan in Markdown",
  "files": {
    "package.json": "...",
    "index.html": "...",
    "src/index.css": "...",
    "src/App.tsx": "...",
    "src/components/...": "..."
  }
}

User request: ${parsed.data.prompt}

${contextSection}`;

    const aiRes = await generateTextUnary({
      userId: u.id,
      modelId,
      feature: 'builder',
      prompt: genPrompt,
    });

    const cleanedJson = aiRes.text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const firstBrace = cleanedJson.indexOf('{');
    const lastBrace = cleanedJson.lastIndexOf('}');
    const parsedBundle = JSON.parse(cleanedJson.slice(firstBrace, lastBrace + 1)) as {
      name?: string;
      planMarkdown?: string;
      files: Record<string, string>;
    };

    const sanitizedFiles: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsedBundle.files || {})) {
      if (typeof v === 'string') {
        sanitizedFiles[validateVirtualFilePath(k)] = v;
      }
    }

    // Compile and auto-repair up to 2 times if esbuild finds TypeScript/JSX errors
    let buildResult = await compileVirtualWorkspace(sanitizedFiles);
    let repairAttempts = 0;
    let currentFiles = sanitizedFiles;

    while (!buildResult.ok && repairAttempts < 2) {
      repairAttempts++;
      const repairRes = await generateTextUnary({
        userId: u.id,
        modelId,
        feature: 'builder',
        prompt: `Fix these compilation errors in the React/TypeScript project. Return ONLY valid JSON {"files": { ...updated files... }}.\n\nBuild Errors:\n${buildResult.logs}\n\nCurrent Files:\n${JSON.stringify(currentFiles)}`,
      });
      try {
        const fixStr = repairRes.text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        const fb = fixStr.indexOf('{');
        const lb = fixStr.lastIndexOf('}');
        const fixJson = JSON.parse(fixStr.slice(fb, lb + 1)) as { files?: Record<string, string> };
        if (fixJson.files) {
          for (const [k, v] of Object.entries(fixJson.files)) {
            if (typeof v === 'string') {
              currentFiles[validateVirtualFilePath(k)] = v;
            }
          }
          buildResult = await compileVirtualWorkspace(currentFiles);
        }
      } catch {
        break;
      }
    }

    const checkpoint = {
      id: `cp-${Date.now()}`,
      label: existingProject ? `Update: ${parsed.data.prompt.slice(0, 40)}` : 'Initial build',
      createdAt: new Date().toISOString(),
      files: currentFiles,
      buildStatus: buildResult.ok ? 'passed' : 'error',
    };

    if (existingProject) {
      const existingCheckpoints = Array.isArray(existingProject.checkpointsJson)
        ? existingProject.checkpointsJson
        : [];
      const nextCheckpoints = [checkpoint, ...existingCheckpoints].slice(0, 20);
      const [updated] = await db
        .update(builderProjects)
        .set({
          planMarkdown: parsedBundle.planMarkdown || existingProject.planMarkdown,
          filesJson: currentFiles,
          checkpointsJson: nextCheckpoints,
          lastBuildStatus: buildResult.ok ? 'passed' : 'error',
          lastBuildLogs: buildResult.logs,
          updatedAt: new Date(),
        })
        .where(eq(builderProjects.id, existingProject.id))
        .returning();

      res.json({
        project: updated,
        previewHtml: buildResult.previewHtml,
        warnings: buildResult.warnings,
      });
      return;
    }

    const [created] = await db
      .insert(builderProjects)
      .values({
        userId: u.id,
        projectId: parsed.data.projectId ?? null,
        name: parsedBundle.name || parsed.data.prompt.slice(0, 48),
        description: parsed.data.prompt.slice(0, 500),
        stack: 'react-ts-tailwind',
        planMarkdown: parsedBundle.planMarkdown || '',
        filesJson: currentFiles,
        checkpointsJson: [checkpoint],
        lastBuildStatus: buildResult.ok ? 'passed' : 'error',
        lastBuildLogs: buildResult.logs,
      })
      .returning();

    res.status(201).json({
      project: created,
      previewHtml: buildResult.previewHtml,
      warnings: buildResult.warnings,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Website generation failed.',
    });
  }
});

router.post('/builder/:id/compile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const id = Number(req.params.id);
    const [proj] = await db
      .select()
      .from(builderProjects)
      .where(and(eq(builderProjects.id, id), eq(builderProjects.userId, u.id)))
      .limit(1);
    if (!proj) {
      res.status(404).json({ error: 'Builder project not found.' });
      return;
    }

    const incomingFiles = req.body?.files as Record<string, string> | undefined;
    const filesToBuild: Record<string, string> = {};
    const source = incomingFiles || proj.filesJson;
    for (const [k, v] of Object.entries(source)) {
      if (typeof v === 'string') {
        filesToBuild[validateVirtualFilePath(k)] = v;
      }
    }

    const buildResult = await compileVirtualWorkspace(filesToBuild);
    const [updated] = await db
      .update(builderProjects)
      .set({
        filesJson: filesToBuild,
        lastBuildStatus: buildResult.ok ? 'passed' : 'error',
        lastBuildLogs: buildResult.logs,
        updatedAt: new Date(),
      })
      .where(eq(builderProjects.id, id))
      .returning();

    res.json({
      project: updated,
      previewHtml: buildResult.previewHtml,
      warnings: buildResult.warnings,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Build verification failed.',
    });
  }
});

router.post('/builder/:id/rollback', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const id = Number(req.params.id);
    const checkpointId = String(req.body?.checkpointId || '');
    const [proj] = await db
      .select()
      .from(builderProjects)
      .where(and(eq(builderProjects.id, id), eq(builderProjects.userId, u.id)))
      .limit(1);
    if (!proj) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const checkpoints = (proj.checkpointsJson as Array<{ id: string; files: Record<string, string> }>) || [];
    const target = checkpoints.find((c) => c.id === checkpointId);
    if (!target) {
      res.status(404).json({ error: 'Checkpoint not found.' });
      return;
    }
    const buildResult = await compileVirtualWorkspace(target.files);
    const [updated] = await db
      .update(builderProjects)
      .set({
        filesJson: target.files,
        lastBuildStatus: buildResult.ok ? 'passed' : 'error',
        lastBuildLogs: `Rolled back to checkpoint ${checkpointId}.\n${buildResult.logs}`,
        updatedAt: new Date(),
      })
      .where(eq(builderProjects.id, id))
      .returning();
    res.json({ project: updated, previewHtml: buildResult.previewHtml });
  } catch (err) {
    res.status(500).json({ error: 'Rollback failed.' });
  }
});

router.get('/builder/:id/download', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const id = Number(req.params.id);
    const [proj] = await db
      .select()
      .from(builderProjects)
      .where(and(eq(builderProjects.id, id), eq(builderProjects.userId, u.id)))
      .limit(1);
    if (!proj) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="sub-ai-app-${proj.id}.zip"`);
    const zip = new JSZip();
    for (const [fname, content] of Object.entries(proj.filesJson || {})) {
      zip.file(validateVirtualFilePath(fname), content);
    }
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.send(zipBuffer);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'ZIP export failed.' });
    }
  }
});

router.delete('/builder/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const u = req.dbUser!;
    const id = Number(req.params.id);
    await db
      .delete(builderProjects)
      .where(and(eq(builderProjects.id, id), eq(builderProjects.userId, u.id)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete project.' });
  }
});

export default router;
