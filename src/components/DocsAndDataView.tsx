import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Play,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import type { UploadedFileItem } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

// Isolated browser Web Worker sandbox for safe client-side dataset computation (zero host access, 3s timeout)
function runInIsolatedWorker(
  rows: Record<string, string | number>[],
  transformFnCode: string,
): Promise<{ result: unknown; error?: string }> {
  return new Promise((resolve) => {
    const workerScript = `
      self.onmessage = function(e) {
        try {
          const rows = e.data.rows;
          const fn = new Function('rows', e.data.code);
          const out = fn(rows);
          self.postMessage({ result: out });
        } catch (err) {
          self.postMessage({ error: err && err.message ? err.message : String(err) });
        }
      };
    `;
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    const timer = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ result: null, error: 'Sandbox execution timed out after 3000ms.' });
    }, 3000);

    worker.onmessage = (ev) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(ev.data);
    };
    worker.onerror = (err) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ result: null, error: err.message || 'Worker execution failed.' });
    };
    worker.postMessage({ rows, code: transformFnCode });
  });
}

export const DocsAndDataView: React.FC = () => {
  const { apiFetch } = useAuth();
  const [tab, setTab] = useState<'docs' | 'data'>('docs');
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<UploadedFileItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Multi-Doc Q&A
  const [qaIds, setQaIds] = useState<number[]>([]);
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');
  const [qaSources, setQaSources] = useState<Array<{ fileName: string; chunkIndex: number }>>([]);
  const [asking, setAsking] = useState(false);

  // Data Lab
  const [profileData, setProfileData] = useState<{
    fileId: number;
    fileName: string;
    rowCount: number;
    headers: string[];
    columns: Array<{
      name: string;
      type: string;
      nonNullCount: number;
      nullCount: number;
      min?: number;
      max?: number;
      mean?: number;
      median?: number;
      uniqueCount?: number;
    }>;
    sampleRows: string[][];
  } | null>(null);
  const [dataQuestion, setDataQuestion] = useState('');
  const [dataLanguage, setDataLanguage] = useState<'python' | 'sql'>('python');
  const [analysisSummary, setAnalysisSummary] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [xKey, setXKey] = useState('');
  const [yKey, setYKey] = useState('');
  const [sandboxOutput, setSandboxOutput] = useState<string>('');
  const [analyzingData, setAnalyzingData] = useState(false);

  const loadFiles = useCallback(async () => {
    const res = await apiFetch('/api/files');
    if (res.ok) {
      const data = await res.json();
      setFiles(data.files || []);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    setUploading(true);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(list)) {
        fd.append('files', f);
      }
      const res = await apiFetch('/api/files', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      await loadFiles();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const inspectFile = async (id: number) => {
    const res = await apiFetch(`/api/files/${id}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedFile(data.file);
    }
  };

  const handleMultiDocQA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qaIds.length === 0 || !qaQuestion.trim() || asking) return;
    setAsking(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/files/qa', {
        method: 'POST',
        body: JSON.stringify({ fileIds: qaIds, question: qaQuestion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Document Q&A failed.');
      setQaAnswer(data.answer);
      setQaSources(data.sources || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Q&A failed.');
    } finally {
      setAsking(false);
    }
  };

  const loadDatasetProfile = async (fileId: number) => {
    setErrorMsg(null);
    const res = await apiFetch('/api/data/profile', {
      method: 'POST',
      body: JSON.stringify({ fileId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Failed to profile dataset.');
      return;
    }
    setProfileData(data);
    setXKey(data.headers[0] || '');
    const numCol = data.columns.find((c: { type: string }) => c.type === 'numeric');
    setYKey(numCol?.name || data.headers[1] || data.headers[0] || '');
  };

  const handleDataAssist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileData || !dataQuestion.trim() || analyzingData) return;
    setAnalyzingData(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/data/assist', {
        method: 'POST',
        body: JSON.stringify({
          fileId: profileData.fileId,
          question: dataQuestion,
          language: dataLanguage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed.');
      setAnalysisSummary(data.summary || '');
      setGeneratedCode(data.notebook?.code || '');
      if (data.notebook?.chartConfigJson?.xKey) setXKey(data.notebook.chartConfigJson.xKey);
      if (data.notebook?.chartConfigJson?.yKey) setYKey(data.notebook.chartConfigJson.yKey);
      if (data.notebook?.chartConfigJson?.type === 'line') setChartType('line');
      else setChartType('bar');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Analysis error.');
    } finally {
      setAnalyzingData(false);
    }
  };

  const chartRows = profileData
    ? profileData.sampleRows.slice(0, 25).map((r) => {
        const obj: Record<string, string | number> = {};
        profileData.headers.forEach((h, idx) => {
          const raw = r[idx] ?? '';
          const num = Number(raw);
          obj[h] = raw !== '' && !Number.isNaN(num) ? num : raw;
        });
        return obj;
      })
    : [];

  const handleRunWorkerSummary = async () => {
    if (!profileData) return;
    const res = await runInIsolatedWorker(
      chartRows,
      `return { totalSampleRows: rows.length, keys: rows[0] ? Object.keys(rows[0]) : [], firstRow: rows[0] || null };`,
    );
    setSandboxOutput(res.error ? `Error: ${res.error}` : JSON.stringify(res.result, null, 2));
  };

  const exportSanitizedCsv = async () => {
    if (!profileData) return;
    const rows = [profileData.headers, ...profileData.sampleRows];
    const res = await apiFetch('/api/data/export-csv', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sanitized-${profileData.fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">Documents & Data Intelligence</h1>
            <p className="text-xs text-neutral-500 mt-1">
              Upload PDF, DOCX, XLSX, CSV, PPTX, images, or code for extraction, multi-document Q&A, profiling, and visualization.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-200/70 dark:bg-[#181A20]">
              <button
                type="button"
                onClick={() => setTab('docs')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  tab === 'docs'
                    ? 'bg-white dark:bg-[#0C0D10] text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                Documents & Q&A
              </button>
              <button
                type="button"
                onClick={() => setTab('data')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  tab === 'data'
                    ? 'bg-white dark:bg-[#0C0D10] text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                Data Lab & Charts
              </button>
            </div>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0">
              <Upload className="w-4 h-4" />
              <span>{uploading ? 'Extracting...' : 'Upload Files'}</span>
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.pptx,.json,.ts,.tsx,.js,.py,.sql,image/*"
                onChange={handleUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-500">
            {errorMsg}
          </div>
        )}

        {tab === 'docs' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-3">
              <h2 className="font-display text-sm font-semibold">
                File Library ({files.length})
              </h2>
              {files.length === 0 ? (
                <p className="text-xs text-neutral-500 py-8 text-center">
                  No uploaded files yet. Upload a PDF, spreadsheet, document, or source file above.
                </p>
              ) : (
                <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {files.map((f) => {
                    const checked = qaIds.includes(f.id);
                    return (
                      <div key={f.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setQaIds((p) =>
                                checked ? p.filter((x) => x !== f.id) : [...p, f.id],
                              )
                            }
                            aria-label={`Select ${f.originalName} for Q&A`}
                          />
                          <button
                            type="button"
                            onClick={() => inspectFile(f.id)}
                            className="text-left min-w-0 cursor-pointer"
                          >
                            <div className="text-xs font-medium truncate hover:text-[#D4B483]">
                              {f.originalName}
                            </div>
                            <div className="text-[11px] text-neutral-500 tabular-nums">
                              {(f.sizeBytes / 1024).toFixed(1)} KB · {f.chunkCount} chunks
                            </div>
                          </button>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {(f.originalName.endsWith('.csv') || f.originalName.endsWith('.xlsx')) && (
                            <button
                              type="button"
                              onClick={() => {
                                setTab('data');
                                void loadDatasetProfile(f.id);
                              }}
                              className="p-1.5 text-neutral-500 hover:text-[#D4B483] cursor-pointer"
                              title="Analyze in Data Lab"
                            >
                              <BarChart3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/files/${f.id}`, { method: 'DELETE' });
                              setFiles((p) => p.filter((x) => x.id !== f.id));
                              if (selectedFile?.id === f.id) setSelectedFile(null);
                            }}
                            className="p-1.5 text-neutral-400 hover:text-red-500 cursor-pointer"
                            title="Delete file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-7 space-y-5">
              <form
                onSubmit={handleMultiDocQA}
                className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold">Multi-Document Q&A</h2>
                  <span className="text-xs text-neutral-500">{qaIds.length} files selected</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={qaQuestion}
                    onChange={(e) => setQaQuestion(e.target.value)}
                    placeholder="Ask across selected documents (check boxes on the left)..."
                    className="flex-1 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] text-xs"
                  />
                  <button
                    type="submit"
                    disabled={asking || qaIds.length === 0 || !qaQuestion.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{asking ? 'Searching...' : 'Ask Docs'}</span>
                  </button>
                </div>
                {qaAnswer && (
                  <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
                    <MarkdownRenderer content={qaAnswer} />
                    {qaSources.length > 0 && (
                      <div className="text-[11px] text-neutral-500">
                        Attributed chunks:{' '}
                        {qaSources.map((s, i) => `${s.fileName} (#${s.chunkIndex + 1})`).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </form>

              {selectedFile && (
                <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#D4B483]" />
                      <span className="text-sm font-semibold">{selectedFile.originalName}</span>
                    </div>
                    <span className="text-xs text-neutral-500">{selectedFile.mimeType}</span>
                  </div>
                  <pre className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#0C0D10] border border-neutral-200 dark:border-neutral-800 text-xs font-mono max-h-80 overflow-auto whitespace-pre-wrap">
                    {(selectedFile.extractedText || '').slice(0, 8000) || 'Binary / empty text preview.'}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-[#D4B483]" />
                <select
                  value={profileData?.fileId ?? ''}
                  onChange={(e) => e.target.value && void loadDatasetProfile(Number(e.target.value))}
                  className="px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
                >
                  <option value="">Select CSV or XLSX dataset...</option>
                  {files
                    .filter((f) => f.originalName.endsWith('.csv') || f.originalName.endsWith('.xlsx'))
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.originalName}
                      </option>
                    ))}
                </select>
              </div>
              {profileData && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRunWorkerSummary}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Run Worker Sandbox Check</span>
                  </button>
                  <button
                    type="button"
                    onClick={exportSanitizedCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Safe CSV</span>
                  </button>
                </div>
              )}
            </div>

            {profileData && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A]">
                    <h3 className="font-display text-sm font-semibold mb-3">
                      Column Statistics ({profileData.rowCount} rows)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                            <th className="py-2 text-left">Column</th>
                            <th className="py-2 text-left">Type</th>
                            <th className="py-2 text-right">Non-Null</th>
                            <th className="py-2 text-right">Mean / Unique</th>
                            <th className="py-2 text-right">Min / Max</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 tabular-nums">
                          {profileData.columns.map((c) => (
                            <tr key={c.name}>
                              <td className="py-2 font-medium">{c.name}</td>
                              <td className="py-2 text-neutral-500">{c.type}</td>
                              <td className="py-2 text-right">{c.nonNullCount}</td>
                              <td className="py-2 text-right">
                                {c.type === 'numeric' ? c.mean : `${c.uniqueCount} unique`}
                              </td>
                              <td className="py-2 text-right">
                                {c.type === 'numeric' ? `${c.min} – ${c.max}` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-sm font-semibold">Interactive Chart</h3>
                      <div className="flex items-center gap-2 text-xs">
                        <select
                          value={xKey}
                          onChange={(e) => setXKey(e.target.value)}
                          className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 bg-transparent"
                        >
                          {profileData.headers.map((h) => (
                            <option key={h} value={h}>
                              X: {h}
                            </option>
                          ))}
                        </select>
                        <select
                          value={yKey}
                          onChange={(e) => setYKey(e.target.value)}
                          className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 bg-transparent"
                        >
                          {profileData.headers.map((h) => (
                            <option key={h} value={h}>
                              Y: {h}
                            </option>
                          ))}
                        </select>
                        <select
                          value={chartType}
                          onChange={(e) => setChartType(e.target.value as 'bar' | 'line')}
                          className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 bg-transparent"
                        >
                          <option value="bar">Bar</option>
                          <option value="line">Line</option>
                        </select>
                      </div>
                    </div>
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        {chartType === 'bar' ? (
                          <BarChart data={chartRows}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey={yKey} fill="#D4B483" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        ) : (
                          <LineChart data={chartRows}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Line type="monotone" dataKey={yKey} stroke="#D4B483" strokeWidth={2} />
                          </LineChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <form
                  onSubmit={handleDataAssist}
                  className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-semibold">AI Data Notebook Generator</h3>
                    <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Isolated Worker Sandbox</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={dataLanguage}
                      onChange={(e) => setDataLanguage(e.target.value as 'python' | 'sql')}
                      className="px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
                    >
                      <option value="python">Python (pandas)</option>
                      <option value="sql">SQL Query</option>
                    </select>
                    <input
                      type="text"
                      value={dataQuestion}
                      onChange={(e) => setDataQuestion(e.target.value)}
                      placeholder="Ask for aggregations, outlier detection, or cohort breakdown..."
                      className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] text-xs"
                    />
                    <button
                      type="submit"
                      disabled={analyzingData || !dataQuestion.trim()}
                      className="px-4 py-2 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold disabled:opacity-40 cursor-pointer"
                    >
                      {analyzingData ? 'Analyzing...' : 'Analyze Dataset'}
                    </button>
                  </div>
                  {analysisSummary && <MarkdownRenderer content={analysisSummary} />}
                  {generatedCode && (
                    <pre className="p-3.5 rounded-xl bg-[#111318] text-neutral-100 text-xs font-mono overflow-x-auto">
                      {generatedCode}
                    </pre>
                  )}
                  {sandboxOutput && (
                    <pre className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] text-xs font-mono overflow-x-auto">
                      {sandboxOutput}
                    </pre>
                  )}
                </form>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
