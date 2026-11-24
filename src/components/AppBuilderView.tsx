import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Code2,
  Download,
  FileCode2,
  History,
  Laptop,
  Loader2,
  Play,
  Rocket,
  RotateCcw,
  Smartphone,
  Tablet,
  Terminal,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { BuilderProjectItem } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

export const AppBuilderView: React.FC = () => {
  const { apiFetch } = useAuth();
  const [projects, setProjects] = useState<BuilderProjectItem[]>([]);
  const [active, setActive] = useState<BuilderProjectItem | null>(null);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [warnings, setWarnings] = useState<string[]>([]);

  const [prompt, setPrompt] = useState('');
  const [building, setBuilding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [rightTab, setRightTab] = useState<'preview' | 'code' | 'plan' | 'checkpoints'>('preview');
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [deployModalOpen, setDeployModalOpen] = useState(false);

  const loadProjects = useCallback(async () => {
    const res = await apiFetch('/api/builder');
    if (res.ok) {
      const data = await res.json();
      setProjects(data.projects || []);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const selectProject = async (proj: BuilderProjectItem) => {
    setActive(proj);
    const f = proj.filesJson || {};
    setFiles(f);
    const keys = Object.keys(f);
    setSelectedFile(f['src/App.tsx'] ? 'src/App.tsx' : keys[0] || '');
    const res = await apiFetch(`/api/builder/${proj.id}/compile`, {
      method: 'POST',
      body: JSON.stringify({ files: f }),
    });
    if (res.ok) {
      const data = await res.json();
      setPreviewHtml(data.previewHtml || '');
      setWarnings(data.warnings || []);
    }
  };

  const handleGenerateOrIterate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || building) return;
    setBuilding(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/builder/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt: prompt.trim(),
          existingProjectId: active?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'App generation failed.');
      const proj = data.project as BuilderProjectItem;
      setActive(proj);
      setFiles(proj.filesJson || {});
      const keys = Object.keys(proj.filesJson || {});
      setSelectedFile(proj.filesJson?.['src/App.tsx'] ? 'src/App.tsx' : keys[0] || '');
      setPreviewHtml(data.previewHtml || '');
      setWarnings(data.warnings || []);
      setPrompt('');
      setRightTab('preview');
      await loadProjects();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'App builder error.');
    } finally {
      setBuilding(false);
    }
  };

  const handleRecompile = async () => {
    if (!active || building) return;
    setBuilding(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/builder/${active.id}/compile`, {
        method: 'POST',
        body: JSON.stringify({ files }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Compilation failed.');
      setActive(data.project);
      setPreviewHtml(data.previewHtml || '');
      setWarnings(data.warnings || []);
      await loadProjects();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Compile error.');
    } finally {
      setBuilding(false);
    }
  };

  const handleRollback = async (checkpointId: string) => {
    if (!active) return;
    const res = await apiFetch(`/api/builder/${active.id}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ checkpointId }),
    });
    if (res.ok) {
      const data = await res.json();
      setActive(data.project);
      setFiles(data.project.filesJson || {});
      setPreviewHtml(data.previewHtml || '');
      await loadProjects();
    }
  };

  const handleDownloadZip = async () => {
    if (!active) return;
    const res = await apiFetch(`/api/builder/${active.id}/download`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sub-ai-app-${active.id}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewWidthClass =
    viewport === 'mobile'
      ? 'w-[390px] max-w-full'
      : viewport === 'tablet'
        ? 'w-[768px] max-w-full'
        : 'w-full';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top Builder Bar */}
      <div className="px-4 sm:px-6 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111216] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="font-display text-base font-semibold whitespace-nowrap shrink-0">
            Autonomous App Builder
          </h1>
          <select
            value={active?.id ?? ''}
            onChange={(e) => {
              const id = Number(e.target.value);
              const found = projects.find((p) => p.id === id);
              if (found) void selectProject(found);
              else {
                setActive(null);
                setFiles({});
                setPreviewHtml('');
              }
            }}
            aria-label="Select builder workspace"
            className="px-2.5 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181A20] max-w-[220px]"
          >
            <option value="">+ New Application</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {active && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRecompile}
              disabled={building}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Save & Compile</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadZip}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export ZIP</span>
            </button>
            <button
              type="button"
              onClick={() => setDeployModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>Deploy</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                await apiFetch(`/api/builder/${active.id}`, { method: 'DELETE' });
                setActive(null);
                setFiles({});
                setPreviewHtml('');
                await loadProjects();
              }}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 cursor-pointer"
              title="Delete app project"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Prompt Bar */}
      <form
        onSubmit={handleGenerateOrIterate}
        className="px-4 sm:px-6 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#14151A] flex flex-wrap gap-2"
      >
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            active
              ? `Instruct SUB AI to update "${active.name}" (e.g. add dark mode toggle, checkout validation)...`
              : 'Describe a full application (e.g. "Build a professional e-commerce storefront with catalog filters, cart drawer, and checkout")'
          }
          className="flex-1 min-w-[260px] px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0C0D10] text-xs focus:outline-none focus:ring-1 focus:ring-[#D4B483]"
        />
        {!active && !prompt && (
          <button
            type="button"
            onClick={() =>
              setPrompt(
                'Build a professional e-commerce website with product listings, category filters, shopping cart drawer, and responsive design.',
              )
            }
            className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-600 dark:text-neutral-300 hover:border-[#D4B483] cursor-pointer whitespace-nowrap shrink-0"
          >
            Use E-Commerce Prompt
          </button>
        )}
        <button
          type="submit"
          disabled={building || !prompt.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
        >
          {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Code2 className="w-3.5 h-3.5" />}
          <span>{building ? 'Building & Verifying...' : active ? 'Update App' : 'Build App'}</span>
        </button>
      </form>

      {errorMsg && (
        <div className="mx-4 mt-3 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-500">
          {errorMsg}
        </div>
      )}

      {/* Main Split IDE */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
        {/* File Explorer + Build Logs */}
        <div className="lg:col-span-3 border-r border-neutral-200 dark:border-neutral-800 flex flex-col min-h-0 bg-white dark:bg-[#111216]">
          <div className="px-3.5 py-2.5 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold flex items-center justify-between">
            <span>Workspace Files ({Object.keys(files).length})</span>
            {active && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] ${
                  active.lastBuildStatus === 'passed' ? 'text-emerald-500' : 'text-amber-500'
                }`}
              >
                {active.lastBuildStatus === 'passed' ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                <span>{active.lastBuildStatus}</span>
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {Object.keys(files).length === 0 ? (
              <div className="p-4 text-xs text-neutral-500">
                Generated source files will appear here.
              </div>
            ) : (
              Object.keys(files)
                .sort()
                .map((fname) => (
                  <button
                    key={fname}
                    type="button"
                    onClick={() => {
                      setSelectedFile(fname);
                      setRightTab('code');
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs font-mono truncate cursor-pointer ${
                      selectedFile === fname
                        ? 'bg-[#D4B483]/15 text-[#9A6E24] dark:text-[#D4B483]'
                        : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{fname}</span>
                  </button>
                ))
            )}
          </div>

          {active?.lastBuildLogs && (
            <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] max-h-40 overflow-y-auto">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500 mb-1">
                <Terminal className="w-3 h-3" />
                <span>Build Diagnostics</span>
              </div>
              <pre className="text-[11px] font-mono text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">
                {active.lastBuildLogs}
              </pre>
              {warnings.map((w, i) => (
                <div key={i} className="mt-1 text-[11px] text-amber-500">
                  {w}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Workspace: Preview / Code / Plan / Checkpoints */}
        <div className="lg:col-span-9 flex flex-col min-h-0 bg-neutral-100 dark:bg-[#0C0D10]">
          <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-neutral-100 dark:bg-[#0C0D10]">
              {(['preview', 'code', 'plan', 'checkpoints'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRightTab(t)}
                  className={`px-3 py-1 text-xs font-medium rounded-md capitalize cursor-pointer ${
                    rightTab === t
                      ? 'bg-white dark:bg-[#181A20] text-neutral-900 dark:text-white shadow-sm'
                      : 'text-neutral-500'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {rightTab === 'preview' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setViewport('desktop')}
                  className={`p-1.5 rounded cursor-pointer ${
                    viewport === 'desktop' ? 'bg-[#D4B483]/20 text-[#D4B483]' : 'text-neutral-500'
                  }`}
                  title="Desktop viewport"
                >
                  <Laptop className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewport('tablet')}
                  className={`p-1.5 rounded cursor-pointer ${
                    viewport === 'tablet' ? 'bg-[#D4B483]/20 text-[#D4B483]' : 'text-neutral-500'
                  }`}
                  title="Tablet viewport"
                >
                  <Tablet className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewport('mobile')}
                  className={`p-1.5 rounded cursor-pointer ${
                    viewport === 'mobile' ? 'bg-[#D4B483]/20 text-[#D4B483]' : 'text-neutral-500'
                  }`}
                  title="Mobile viewport"
                >
                  <Smartphone className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-4 flex justify-center">
            {rightTab === 'preview' && (
              previewHtml ? (
                <div
                  className={`h-full min-h-[460px] rounded-xl overflow-hidden border border-neutral-300 dark:border-neutral-800 bg-white shadow-sm transition-all ${previewWidthClass}`}
                >
                  <iframe
                    title="Sandboxed App Preview"
                    sandbox="allow-scripts"
                    srcDoc={previewHtml}
                    className="w-full h-full border-0"
                  />
                </div>
              ) : (
                <div className="m-auto text-center max-w-md text-xs text-neutral-500 space-y-2">
                  <Code2 className="w-8 h-8 mx-auto text-neutral-400" />
                  <p>
                    Enter an application prompt above to generate a multi-file React + TypeScript + Tailwind project compiled in an isolated esbuild sandbox.
                  </p>
                </div>
              )
            )}

            {rightTab === 'code' && (
              <div className="w-full h-full flex flex-col">
                <div className="text-xs font-mono text-neutral-500 mb-2">
                  {selectedFile || 'Select a file from the explorer'}
                </div>
                <textarea
                  value={files[selectedFile] ?? ''}
                  onChange={(e) =>
                    selectedFile && setFiles((prev) => ({ ...prev, [selectedFile]: e.target.value }))
                  }
                  spellCheck={false}
                  className="flex-1 w-full p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-[#111318] text-neutral-100 font-mono text-xs leading-relaxed focus:outline-none"
                />
              </div>
            )}

            {rightTab === 'plan' && (
              <div className="w-full max-w-3xl p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] h-fit">
                <h2 className="font-display text-base font-semibold mb-3">Architecture Plan</h2>
                {active?.planMarkdown ? (
                  <MarkdownRenderer content={active.planMarkdown} />
                ) : (
                  <p className="text-xs text-neutral-500">No architecture plan recorded yet.</p>
                )}
              </div>
            )}

            {rightTab === 'checkpoints' && (
              <div className="w-full max-w-2xl space-y-3 h-fit">
                {(active?.checkpointsJson || []).map((cp) => (
                  <div
                    key={cp.id}
                    className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="text-xs font-semibold flex items-center gap-2">
                        <History className="w-3.5 h-3.5 text-[#D4B483]" />
                        <span>{cp.label}</span>
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-1 tabular-nums">
                        {new Date(cp.createdAt).toLocaleString()} · Build: {cp.buildStatus}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRollback(cp.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {deployModalOpen && active && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">Export & Hosting Deployment</h3>
              <button
                type="button"
                onClick={() => setDeployModalOpen(false)}
                className="text-neutral-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              External cloud deployments require authorized hosting credentials (such as Vercel, Cloud Run, or Netlify tokens). Review the generated code first, then download the complete Vite/React ZIP package to deploy to your hosting provider.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeployModalOpen(false)}
                className="px-3 py-2 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeployModalOpen(false);
                  void handleDownloadZip();
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] cursor-pointer"
              >
                Download Deployable ZIP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
