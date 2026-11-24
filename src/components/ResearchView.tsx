import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Globe,
  Loader2,
  Search,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { ResearchRunItem, ResearchSource } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

export const ResearchView: React.FC = () => {
  const { apiFetch } = useAuth();
  const [mode, setMode] = useState<'deep' | 'quick'>('deep');
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [steps, setSteps] = useState<Array<{ step: string; detail: string }>>([]);
  const [liveSources, setLiveSources] = useState<ResearchSource[]>([]);
  const [quickSummary, setQuickSummary] = useState('');

  const [history, setHistory] = useState<ResearchRunItem[]>([]);
  const [activeRun, setActiveRun] = useState<ResearchRunItem | null>(null);

  const loadHistory = useCallback(async () => {
    const res = await apiFetch('/api/research/runs');
    if (res.ok) {
      const data = await res.json();
      setHistory(data.runs || []);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || running) return;
    setRunning(true);
    setErrorMsg(null);
    setSteps([]);
    setLiveSources([]);
    setQuickSummary('');
    setActiveRun(null);

    try {
      if (mode === 'quick') {
        const res = await apiFetch(`/api/research/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Search failed.');
        setQuickSummary(data.summary || '');
        setLiveSources(data.sources || []);
        return;
      }

      const res = await apiFetch('/api/research/deep', {
        method: 'POST',
        body: JSON.stringify({ query: query.trim() }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Deep research failed.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const lines = frame.split('\n');
          let evt = 'message';
          let dataStr = '';
          for (const l of lines) {
            if (l.startsWith('event:')) evt = l.slice(6).trim();
            if (l.startsWith('data:')) dataStr += l.slice(5).trim();
          }
          if (!dataStr) continue;
          const parsed = JSON.parse(dataStr);
          if (evt === 'step') {
            setSteps((prev) => [...prev, { step: parsed.step, detail: parsed.detail }]);
          } else if (evt === 'sources') {
            setLiveSources(parsed.sources || []);
          } else if (evt === 'done') {
            setActiveRun(parsed.run);
            await loadHistory();
          } else if (evt === 'error') {
            setErrorMsg(parsed.message || 'Research error');
          }
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Research request failed.');
    } finally {
      setRunning(false);
    }
  };

  const downloadReport = (run: ResearchRunItem) => {
    const md = `# Deep Research: ${run.query}\n\n${run.reportMarkdown}\n\n## Sources\n${(run.sourcesJson || [])
      .map((s, i) => `${i + 1}. [${s.title}](${s.url}) (${s.reliabilityTier})`)
      .join('\n')}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sub-ai-research-${run.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayedSources = activeRun ? activeRun.sourcesJson : liveSources;

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">Live Search & Deep Research</h1>
            <p className="text-xs text-neutral-500 mt-1">
              Retrieves current web sources with domain reliability labels, page verification, and clickable citations.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-200/70 dark:bg-[#181A20]">
            <button
              type="button"
              onClick={() => setMode('deep')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                mode === 'deep'
                  ? 'bg-white dark:bg-[#0C0D10] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Deep Research Report
            </button>
            <button
              type="button"
              onClick={() => setMode('quick')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                mode === 'quick'
                  ? 'bg-white dark:bg-[#0C0D10] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Quick Live Search
            </button>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === 'deep'
                  ? 'Enter a complex research topic for multi-query investigation...'
                  : 'Search current events, documentation, or live facts...'
              }
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] text-sm focus:outline-none focus:ring-1 focus:ring-[#D4B483]"
            />
          </div>
          <button
            type="submit"
            disabled={running || !query.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            <span>{running ? 'Researching...' : mode === 'deep' ? 'Run Deep Research' : 'Search Web'}</span>
          </button>
        </form>

        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        {steps.length > 0 && (
          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-2">
            <div className="text-xs font-semibold">Research Pipeline Progress</div>
            {steps.map((s, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-neutral-900 dark:text-neutral-200">{s.step}: </span>
                  <span>{s.detail}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {activeRun ? (
              <div className="p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A]">
                <div className="flex items-start justify-between gap-4 pb-4 mb-4 border-b border-neutral-200 dark:border-neutral-800">
                  <div>
                    <h2 className="font-display text-lg font-semibold">{activeRun.query}</h2>
                    <div className="text-xs text-neutral-500 mt-1 tabular-nums">
                      {(activeRun.sourcesJson || []).length} sources · {(activeRun.durationMs / 1000).toFixed(1)}s
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadReport(activeRun)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export MD</span>
                  </button>
                </div>
                <MarkdownRenderer content={activeRun.reportMarkdown} />
              </div>
            ) : quickSummary ? (
              <div className="p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A]">
                <h2 className="font-display text-base font-semibold mb-3">Grounded Search Summary</h2>
                <MarkdownRenderer content={quickSummary} />
              </div>
            ) : (
              <div className="p-10 text-center rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 text-xs text-neutral-500">
                Run a Deep Research query or select a previous report from the right panel.
              </div>
            )}

            {displayedSources.length > 0 && (
              <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A]">
                <h3 className="font-display text-sm font-semibold mb-3">
                  Verified Retrieved Sources ({displayedSources.length})
                </h3>
                <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {displayedSources.map((s, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                      <div className="min-w-0">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[#B8893A] dark:text-[#D4B483] hover:underline inline-flex items-center gap-1 truncate max-w-full"
                        >
                          <span>[{idx + 1}] {s.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                        <div className="text-[11px] text-neutral-500 mt-0.5 truncate">
                          {s.domain} · {s.provider} · {new Date(s.retrievedAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-medium shrink-0 ${
                          s.reliabilityTier === 'high'
                            ? 'text-emerald-500'
                            : s.reliabilityTier === 'unverified'
                              ? 'text-amber-500'
                              : 'text-neutral-500'
                        }`}
                      >
                        {s.reliabilityTier}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Saved Reports History */}
          <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] h-fit">
            <h3 className="font-display text-sm font-semibold mb-3">Saved Reports</h3>
            {history.length === 0 ? (
              <p className="text-xs text-neutral-500">No saved research reports yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((r) => (
                  <div
                    key={r.id}
                    className={`p-3 rounded-xl border transition-colors flex items-start justify-between gap-2 ${
                      activeRun?.id === r.id
                        ? 'border-[#D4B483] bg-[#D4B483]/10'
                        : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveRun(r)}
                      className="text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="text-xs font-medium truncate">{r.query}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5 tabular-nums">
                        {(r.sourcesJson || []).length} sources · {new Date(r.createdAt).toLocaleDateString()}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/research/runs/${r.id}`, { method: 'DELETE' });
                        setHistory((p) => p.filter((x) => x.id !== r.id));
                        if (activeRun?.id === r.id) setActiveRun(null);
                      }}
                      className="text-neutral-400 hover:text-red-500 p-1 cursor-pointer"
                      title="Delete report"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
