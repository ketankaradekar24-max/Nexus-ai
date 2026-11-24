import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Download,
  FolderKanban,
  MessageSquarePlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type {
  ConversationItem,
  MemoryCandidate,
  MemoryItem,
  ProjectItem,
  UploadedFileItem,
} from '../types';

export const ProjectsView: React.FC<{
  onStartProjectChat: (projectId: number) => void;
  onOpenConversation: (conversationId: number) => void;
}> = ({ onStartProjectChat, onOpenConversation }) => {
  const { apiFetch } = useAuth();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [active, setActive] = useState<ProjectItem | null>(null);
  const [details, setDetails] = useState<{
    conversations: ConversationItem[];
    files: UploadedFileItem[];
    memories: MemoryItem[];
  } | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [creating, setCreating] = useState(false);

  const loadProjects = useCallback(async () => {
    const res = await apiFetch('/api/projects');
    if (res.ok) {
      const data = await res.json();
      setProjects(data.projects || []);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const selectProject = async (proj: ProjectItem) => {
    setActive(proj);
    const res = await apiFetch(`/api/projects/${proj.id}`);
    if (res.ok) {
      const data = await res.json();
      setDetails({
        conversations: data.conversations || [],
        files: data.files || [],
        memories: data.memories || [],
      });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const res = await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name, description, instructions }),
      });
      if (res.ok) {
        const data = await res.json();
        setName('');
        setDescription('');
        setInstructions('');
        await loadProjects();
        await selectProject(data.project);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleExportZip = async (projectId: number) => {
    const res = await apiFetch(`/api/projects/${projectId}/export`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sub-ai-project-${projectId}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Projects & Workspaces</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Organize conversations, files, instructions, and shared memory into isolated project workspaces.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <form
              onSubmit={handleCreate}
              className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-3"
            >
              <h2 className="font-display text-sm font-semibold">New Project</h2>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name (e.g. Q4 Market Launch)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
              />
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={2}
                placeholder="Project-specific AI instructions..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
              />
              <button
                type="submit"
                disabled={creating || !name.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Project</span>
              </button>
            </form>

            <div className="space-y-2">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                    active?.id === p.id
                      ? 'border-[#D4B483] bg-[#D4B483]/10'
                      : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectProject(p)}
                    className="text-left min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <FolderKanban className="w-4 h-4 text-[#D4B483] shrink-0" />
                      <span className="truncate">{p.name}</span>
                    </div>
                    {p.description && (
                      <p className="text-xs text-neutral-500 mt-1 truncate">{p.description}</p>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/projects/${p.id}`, { method: 'DELETE' });
                      if (active?.id === p.id) {
                        setActive(null);
                        setDetails(null);
                      }
                      await loadProjects();
                    }}
                    className="p-1.5 text-neutral-400 hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7">
            {active ? (
              <div className="p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-neutral-800">
                  <div>
                    <h2 className="font-display text-lg font-semibold">{active.name}</h2>
                    {active.description && (
                      <p className="text-xs text-neutral-500 mt-1">{active.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onStartProjectChat(active.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold cursor-pointer"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      <span>New Project Chat</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportZip(active.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export ZIP</span>
                    </button>
                  </div>
                </div>

                {active.instructions && (
                  <div>
                    <div className="text-xs font-semibold text-neutral-500 mb-1">
                      Project Instructions
                    </div>
                    <p className="text-xs leading-relaxed p-3 rounded-lg bg-neutral-50 dark:bg-[#0C0D10] border border-neutral-200 dark:border-neutral-800">
                      {active.instructions}
                    </p>
                  </div>
                )}

                <div>
                  <div className="text-xs font-semibold mb-2">
                    Project Conversations ({details?.conversations.length ?? 0})
                  </div>
                  {details?.conversations.length ? (
                    <div className="space-y-1.5">
                      {details.conversations.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onOpenConversation(c.id)}
                          className="w-full text-left px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-[#D4B483] text-xs flex items-center justify-between cursor-pointer"
                        >
                          <span className="truncate font-medium">{c.title}</span>
                          <span className="text-[11px] text-neutral-500">{c.model}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-500">No conversations in this project yet.</p>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold mb-2">
                    Project Files ({details?.files.length ?? 0})
                  </div>
                  {details?.files.length ? (
                    <div className="flex flex-wrap gap-2">
                      {details.files.map((f) => (
                        <span
                          key={f.id}
                          className="px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 text-xs"
                        >
                          {f.originalName}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-500">No files linked to this project.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 text-xs text-neutral-500">
                Select or create a project to manage workspace instructions, shared conversations, and files.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const MemoryView: React.FC = () => {
  const { apiFetch, profile, refreshProfile } = useAuth();
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [candidates, setCandidates] = useState<MemoryCandidate[]>([]);
  const [customInstructions, setCustomInstructions] = useState(profile?.customInstructions || '');
  const [memoryEnabled, setMemoryEnabled] = useState(profile?.memoryEnabled ?? true);

  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('preference');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  const loadAll = useCallback(async () => {
    const [mRes, cRes] = await Promise.all([
      apiFetch('/api/memory'),
      apiFetch('/api/memory/candidates'),
    ]);
    if (mRes.ok) {
      const data = await mRes.json();
      setMemories(data.memories || []);
    }
    if (cRes.ok) {
      const data = await cRes.json();
      setCandidates(data.candidates || []);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const saveInstructions = async () => {
    const res = await apiFetch('/api/account/me', {
      method: 'PATCH',
      body: JSON.stringify({ customInstructions, memoryEnabled }),
    });
    if (res.ok) {
      await refreshProfile();
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 1800);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    const res = await apiFetch('/api/memory', {
      method: 'POST',
      body: JSON.stringify({ content: newContent, category: newCategory }),
    });
    if (res.ok) {
      setNewContent('');
      await loadAll();
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Memory & Custom Instructions</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Control persistent facts remembered across chats and approve or reject AI-suggested memory candidates.
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Global Custom Instructions</h2>
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={memoryEnabled}
                onChange={(e) => setMemoryEnabled(e.target.checked)}
              />
              <span>Enable persistent memory</span>
            </label>
          </div>
          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            rows={3}
            placeholder="Tell SUB AI how you prefer responses formatted, your expertise level, or coding conventions..."
            className="w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10] text-xs"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-500">{savedNotice ? 'Preferences saved.' : ''}</span>
            <button
              type="button"
              onClick={saveInstructions}
              className="px-4 py-2 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold cursor-pointer"
            >
              Save Instructions
            </button>
          </div>
        </div>

        {candidates.length > 0 && (
          <div className="p-5 rounded-2xl border border-[#D4B483]/40 bg-[#D4B483]/5 space-y-3">
            <h2 className="font-display text-sm font-semibold">
              Pending Memory Suggestions ({candidates.length})
            </h2>
            <div className="space-y-2">
              {candidates.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] flex items-center justify-between gap-3"
                >
                  <div className="text-xs">
                    <span className="font-medium text-[#B8893A] dark:text-[#D4B483] mr-2">
                      [{c.category}]
                    </span>
                    <span>{c.content}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/memory/candidates/${c.id}/approve`, { method: 'POST' });
                        await loadAll();
                      }}
                      className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 cursor-pointer"
                      title="Approve memory"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/memory/candidates/${c.id}/reject`, { method: 'POST' });
                        await loadAll();
                      }}
                      className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 cursor-pointer"
                      title="Reject memory"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] space-y-4">
          <h2 className="font-display text-sm font-semibold">Saved Memories ({memories.length})</h2>
          <form onSubmit={handleAddMemory} className="flex flex-wrap gap-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
            >
              <option value="preference">Preference</option>
              <option value="profile">Profile</option>
              <option value="project">Project</option>
              <option value="general">General</option>
            </select>
            <input
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Add a durable fact or preference..."
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0C0D10]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold cursor-pointer"
            >
              Add Memory
            </button>
          </form>

          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {memories.map((m) => (
              <div key={m.id} className="py-3 flex items-center justify-between gap-3">
                {editingId === m.id ? (
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      className="flex-1 px-2.5 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-transparent"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/memory/${m.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ content: editingContent }),
                        });
                        setEditingId(null);
                        await loadAll();
                      }}
                      className="px-2.5 py-1 text-xs rounded bg-[#D4B483] text-[#0C0D10] font-semibold cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="text-xs">
                    <span className="font-medium text-neutral-500 mr-2">[{m.category}]</span>
                    <span>{m.content}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(m.id);
                      setEditingContent(m.content);
                    }}
                    className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/memory/${m.id}`, { method: 'DELETE' });
                      setMemories((p) => p.filter((x) => x.id !== m.id));
                    }}
                    className="p-1.5 text-neutral-400 hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
