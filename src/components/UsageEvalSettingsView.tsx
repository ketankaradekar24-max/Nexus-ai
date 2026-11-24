import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Download,
  FlaskConical,
  KeyRound,
  Moon,
  Play,
  Sun,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const ExploreModelsView: React.FC<{ onTryModel: (modelId: string) => void }> = ({
  onTryModel,
}) => {
  const { models } = useAuth();

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Explore Models & Capabilities</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Explicit capability metadata and availability status across providers. Models differ in architecture, context window, and cost.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                <th className="p-3.5 text-left">Model</th>
                <th className="p-3.5 text-left">Provider</th>
                <th className="p-3.5 text-right">Context</th>
                <th className="p-3.5 text-left">Capabilities</th>
                <th className="p-3.5 text-left">Availability</th>
                <th className="p-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {models.map((m) => {
                const caps = [
                  m.capabilities.thinking && 'Thinking',
                  m.capabilities.vision && 'Vision',
                  m.capabilities.webGrounding && 'Web',
                  m.capabilities.imageGen && 'Image Gen',
                  m.capabilities.tools && 'Tools',
                ]
                  .filter(Boolean)
                  .join(' · ');

                return (
                  <tr key={m.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                    <td className="p-3.5">
                      <div className="font-semibold">{m.displayName}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5 max-w-md">
                        {m.description}
                      </div>
                    </td>
                    <td className="p-3.5 capitalize">{m.provider}</td>
                    <td className="p-3.5 text-right font-mono tabular-nums">
                      {(m.contextWindow / 1000).toLocaleString()}k
                    </td>
                    <td className="p-3.5 text-neutral-600 dark:text-neutral-400">{caps || 'Text'}</td>
                    <td className="p-3.5">
                      <span className={m.available ? 'text-emerald-500 font-medium' : 'text-amber-500'}>
                        {m.available ? `Ready (${m.availabilitySource})` : 'Awaiting Key'}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      {!m.capabilities.imageGen && m.available && (
                        <button
                          type="button"
                          onClick={() => onTryModel(m.id)}
                          className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:border-[#D4B483] cursor-pointer"
                        >
                          Use in Chat
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const UsageAndEvalsView: React.FC = () => {
  const { apiFetch } = useAuth();
  const [usage, setUsage] = useState<{
    totals: {
      requests: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCostUsd: number;
    };
    byModel: Record<string, { requests: number; tokens: number; costUsd: number }>;
    recentLogs: Array<{
      id: number;
      model: string;
      feature: string;
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: string;
      latencyMs: number;
      status: string;
      createdAt: string;
    }>;
  } | null>(null);
  const [suites, setSuites] = useState<
    Array<{ id: string; name: string; description: string; caseCount: number }>
  >([]);
  const [evalRuns, setEvalRuns] = useState<
    Array<{
      id: number;
      suiteName: string;
      model: string;
      totalCases: number;
      passedCases: number;
      avgLatencyMs: number;
      createdAt: string;
    }>
  >([]);
  const [runningSuite, setRunningSuite] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [uRes, eRes] = await Promise.all([
      apiFetch('/api/usage/summary'),
      apiFetch('/api/evals/suites'),
    ]);
    if (uRes.ok) setUsage(await uRes.json());
    if (eRes.ok) {
      const data = await eRes.json();
      setSuites(data.suites || []);
      setEvalRuns(data.runs || []);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleRunEval = async (suiteId: string) => {
    setRunningSuite(suiteId);
    try {
      await apiFetch('/api/evals/run', {
        method: 'POST',
        body: JSON.stringify({ suiteId, model: 'gemini-4-hydrogen' }),
      });
      await loadAll();
    } finally {
      setRunningSuite(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Usage Analytics & Evaluations</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Measured token consumption, estimated cost ledger, and reproducible quality & sandbox benchmark suites.
          </p>
        </div>

        {usage && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A]">
              <div className="text-xs text-neutral-500">Recorded Requests</div>
              <div className="text-2xl font-display font-semibold mt-1 tabular-nums">
                {usage.totals.requests}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A]">
              <div className="text-xs text-neutral-500">Input Tokens</div>
              <div className="text-2xl font-display font-semibold mt-1 tabular-nums">
                {usage.totals.totalInputTokens.toLocaleString()}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A]">
              <div className="text-xs text-neutral-500">Output Tokens</div>
              <div className="text-2xl font-display font-semibold mt-1 tabular-nums">
                {usage.totals.totalOutputTokens.toLocaleString()}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A]">
              <div className="text-xs text-neutral-500">Estimated Cost</div>
              <div className="text-2xl font-display font-semibold mt-1 tabular-nums">
                ${usage.totals.totalCostUsd.toFixed(4)}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-4">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-[#D4B483]" />
              <h2 className="font-display text-sm font-semibold">Reproducible Evaluation Suites</h2>
            </div>
            <div className="space-y-3">
              {suites.map((s) => (
                <div
                  key={s.id}
                  className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-semibold">{s.name}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      {s.description} ({s.caseCount} cases)
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={runningSuite === s.id}
                    onClick={() => handleRunEval(s.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Play className="w-3 h-3" />
                    <span>{runningSuite === s.id ? 'Running...' : 'Run Suite'}</span>
                  </button>
                </div>
              ))}
            </div>

            {evalRuns.length > 0 && (
              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
                <div className="text-xs font-semibold">Recent Benchmark Runs</div>
                {evalRuns.slice(0, 6).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-xs py-1.5 tabular-nums"
                  >
                    <div>
                      <span className="font-medium">{r.suiteName}</span>
                      <span className="text-neutral-500 ml-2">{r.model}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-500 font-medium">
                        {r.passedCases}/{r.totalCases} passed
                      </span>
                      <span className="text-neutral-500">{r.avgLatencyMs}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-3">
            <h2 className="font-display text-sm font-semibold">Recent Usage Ledger</h2>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                    <th className="py-2 text-left">Feature</th>
                    <th className="py-2 text-left">Model</th>
                    <th className="py-2 text-right">Tokens</th>
                    <th className="py-2 text-right">Latency</th>
                    <th className="py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 tabular-nums">
                  {(usage?.recentLogs || []).slice(0, 15).map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 capitalize">{l.feature}</td>
                      <td className="py-2 truncate max-w-[140px]">{l.model}</td>
                      <td className="py-2 text-right">
                        {(l.inputTokens + l.outputTokens).toLocaleString()}
                      </td>
                      <td className="py-2 text-right">{l.latencyMs}ms</td>
                      <td
                        className={`py-2 text-right ${
                          l.status === 'success' ? 'text-emerald-500' : 'text-amber-500'
                        }`}
                      >
                        {l.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const { apiFetch, profile, models, refreshProfile, refreshModels, setThemeLocal, signOut } =
    useAuth();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [preferredModel, setPreferredModel] = useState(
    profile?.preferredModel || 'gemini-4-hydrogen',
  );
  const [keys, setKeys] = useState<
    Array<{ provider: string; keyHint: string; baseUrl: string }>
  >([]);
  const [providerInput, setProviderInput] = useState<'openai' | 'anthropic' | 'xai' | 'ollama'>(
    'openai',
  );
  const [apiKeyVal, setApiKeyVal] = useState('');
  const [baseUrlVal, setBaseUrlVal] = useState('');
  const [overview, setOverview] = useState<{
    health: { database: string; dbLatencyMs: number; uptimeSeconds: number };
    counts: { conversations: number; files: number; images: number };
  } | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadSettingsData = useCallback(async () => {
    const [kRes, aRes] = await Promise.all([
      apiFetch('/api/account/keys'),
      apiFetch('/api/admin/overview'),
    ]);
    if (kRes.ok) {
      const data = await kRes.json();
      setKeys(data.keys || []);
    }
    if (aRes.ok) {
      setOverview(await aRes.json());
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadSettingsData();
  }, [loadSettingsData]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/account/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName, preferredModel }),
    });
    if (res.ok) {
      await refreshProfile();
      setStatusMsg('Profile settings updated.');
      setTimeout(() => setStatusMsg(null), 2000);
    }
  };

  const handleToggleTheme = async (theme: 'dark' | 'light') => {
    setThemeLocal(theme);
    await apiFetch('/api/account/me', {
      method: 'PATCH',
      body: JSON.stringify({ theme }),
    });
  };

  const handleSaveByok = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/account/keys', {
      method: 'PUT',
      body: JSON.stringify({
        provider: providerInput,
        apiKey: apiKeyVal,
        baseUrl: baseUrlVal,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatusMsg(data.error || 'Failed to save provider key.');
      return;
    }
    setApiKeyVal('');
    setBaseUrlVal('');
    await Promise.all([loadSettingsData(), refreshModels()]);
    setStatusMsg(`Saved encrypted ${providerInput.toUpperCase()} configuration.`);
  };

  const handleExportAllData = async () => {
    const res = await apiFetch('/api/account/export');
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sub-ai-account-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAccount = async () => {
    const res = await apiFetch('/api/account/me', { method: 'DELETE' });
    if (res.ok) {
      await signOut();
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Settings, Provider Keys & Health</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Manage profile preferences, third-party encrypted BYOK credentials, workspace health, and data export.
          </p>
        </div>

        {statusMsg && (
          <div className="p-3 rounded-xl border border-[#D4B483]/50 bg-[#D4B483]/10 text-xs">
            {statusMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <form
            onSubmit={handleSaveProfile}
            className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-4"
          >
            <h2 className="font-display text-sm font-semibold">Profile & Appearance</h2>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Default Chat Model</label>
              <select
                value={preferredModel}
                onChange={(e) => setPreferredModel(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
              >
                {models
                  .filter((m) => !m.capabilities.imageGen)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1.5">Theme</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleTheme('dark')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                    profile?.theme !== 'light'
                      ? 'border-[#D4B483] bg-[#D4B483]/15 text-[#D4B483]'
                      : 'border-neutral-200 dark:border-neutral-800'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark Charcoal</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleTheme('light')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                    profile?.theme === 'light'
                      ? 'border-[#B8893A] bg-[#D4B483]/15 text-[#9A6E24]'
                      : 'border-neutral-200 dark:border-neutral-800'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light</span>
                </button>
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold cursor-pointer"
            >
              Save Profile
            </button>
          </form>

          <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#D4B483]" />
              <h2 className="font-display text-sm font-semibold">Third-Party BYOK Key Vault</h2>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Optionally connect OpenAI, Anthropic, xAI, or a local Ollama endpoint (encrypted at rest via AES-256-GCM). Gemini credentials are managed automatically via server Secrets.
            </p>
            <form onSubmit={handleSaveByok} className="space-y-2.5">
              <select
                value={providerInput}
                onChange={(e) => setProviderInput(e.target.value as typeof providerInput)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
              >
                <option value="openai">OpenAI (GPT-4o / o3-mini)</option>
                <option value="anthropic">Anthropic (Claude Sonnet 4)</option>
                <option value="xai">xAI (Grok 3)</option>
                <option value="ollama">Ollama Local Endpoint</option>
              </select>
              {providerInput !== 'ollama' && (
                <input
                  type="password"
                  value={apiKeyVal}
                  onChange={(e) => setApiKeyVal(e.target.value)}
                  placeholder="Enter provider API key..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
                />
              )}
              {providerInput === 'ollama' && (
                <input
                  type="url"
                  value={baseUrlVal}
                  onChange={(e) => setBaseUrlVal(e.target.value)}
                  placeholder="e.g. http://127.0.0.1:11434/v1"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
                />
              )}
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold cursor-pointer"
              >
                Save Encrypted Credential
              </button>
            </form>

            {keys.length > 0 && (
              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-1.5">
                {keys.map((k) => (
                  <div key={k.provider} className="flex items-center justify-between text-xs">
                    <span>
                      <strong className="uppercase">{k.provider}</strong> ·{' '}
                      <span className="font-mono text-neutral-500">{k.keyHint || k.baseUrl}</span>
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/account/keys/${k.provider}`, { method: 'DELETE' });
                        await Promise.all([loadSettingsData(), refreshModels()]);
                      }}
                      className="text-red-500 hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {overview && (
          <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Activity className="w-4 h-4 text-emerald-500" />
              <div className="text-xs">
                <div className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Workspace Health: Nominal</span>
                </div>
                <div className="text-neutral-500 mt-0.5 tabular-nums">
                  {overview.counts.conversations} conversations · {overview.counts.files} documents ·{' '}
                  {overview.counts.images} images
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportAllData}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Account JSON</span>
              </button>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/40 text-red-500 text-xs cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Account</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Confirm Permanent Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
