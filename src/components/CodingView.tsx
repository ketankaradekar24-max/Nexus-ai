import React, { useState } from 'react';
import { Code2, Loader2, Terminal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MarkdownRenderer } from './MarkdownRenderer';

export const CodingView: React.FC = () => {
  const { apiFetch, models } = useAuth();
  const [mode, setMode] = useState<'generate' | 'explain' | 'debug' | 'refactor' | 'review' | 'tests'>(
    'generate',
  );
  const [language, setLanguage] = useState('typescript');
  const [model, setModel] = useState('gemini-4-hydrogen');
  const [prompt, setPrompt] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || running) return;
    setRunning(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/coding/assist', {
        method: 'POST',
        body: JSON.stringify({ mode, language, prompt, code, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Coding request failed.');
      setResult(data.result || '');
      setDiagnostic(data.staticDiagnostic || '');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Coding assistant error.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">Coding Intelligence</h1>
            <p className="text-xs text-neutral-500 mt-1">
              Code generation, debugging, refactoring, review, and test synthesis with static JS/TS syntax diagnostics. Code is never executed on the server host.
            </p>
          </div>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A]"
          >
            {models
              .filter((m) => !m.capabilities.imageGen)
              .map((m) => (
                <option key={m.id} value={m.id} disabled={!m.available}>
                  {m.displayName} {!m.available ? '(Key Required)' : ''}
                </option>
              ))}
          </select>
        </div>

        <form
          onSubmit={handleRun}
          className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-[#0C0D10]">
              {(['generate', 'explain', 'debug', 'refactor', 'review', 'tests'] as const).map(
                (m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize cursor-pointer ${
                      mode === m
                        ? 'bg-white dark:bg-[#181A20] text-neutral-900 dark:text-white shadow-sm'
                        : 'text-neutral-500'
                    }`}
                  >
                    {m}
                  </button>
                ),
              )}
            </div>

            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
            >
              <option value="typescript">TypeScript</option>
              <option value="tsx">React TSX</option>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="sql">SQL</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
            </select>
          </div>

          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what to generate, fix, review, or test..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] text-xs"
          />

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder="Optional: paste source code here for explanation, debugging, refactoring, review, or unit test generation..."
            className="w-full p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-[#111318] text-neutral-100 font-mono text-xs leading-relaxed"
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={running || !prompt.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold disabled:opacity-40 cursor-pointer"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code2 className="w-4 h-4" />}
              <span>{running ? 'Processing...' : `Run ${mode}`}</span>
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-500">
            {errorMsg}
          </div>
        )}

        {diagnostic && (
          <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#14151A] text-xs font-mono flex items-start gap-2">
            <Terminal className="w-4 h-4 text-[#D4B483] shrink-0 mt-0.5" />
            <span>{diagnostic}</span>
          </div>
        )}

        {result && (
          <div className="p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A]">
            <MarkdownRenderer content={result} />
          </div>
        )}
      </div>
    </div>
  );
};
