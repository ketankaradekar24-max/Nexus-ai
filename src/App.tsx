import React, { Component, useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Archive,
  ArchiveRestore,
  Bookmark,
  BookMarked,
  Brain,
  Check,
  Code2,
  Compass,
  FileSpreadsheet,
  FolderKanban,
  Globe,
  Hammer,
  Image as ImageIcon,
  LogOut,
  Menu,
  MessageSquare,
  Mic,
  Moon,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthGate } from './components/AuthGate';
import { ChatWorkspace } from './components/ChatWorkspace';
import { ImageStudioView } from './components/ImageStudioView';
import { ResearchView } from './components/ResearchView';
import { AppBuilderView } from './components/AppBuilderView';
import { VoiceStudioView } from './components/VoiceStudioView';
import { DocsAndDataView } from './components/DocsAndDataView';
import { CodingView } from './components/CodingView';
import { ProjectsView, MemoryView } from './components/ProjectsAndMemoryView';
import {
  ExploreModelsView,
  UsageAndEvalsView,
  SettingsView,
} from './components/UsageEvalSettingsView';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import type { ChatSource, ConversationItem, WorkspaceView } from './types';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class WorkspaceErrorBoundary extends Component<
  { children: React.ReactNode; onReset: () => void },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Unexpected workspace rendering error.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] p-6 space-y-3">
            <h2 className="font-display text-lg font-semibold">Workspace Recovered</h2>
            <p className="text-xs text-neutral-500 leading-relaxed">{this.state.message}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                this.props.onReset();
              }}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium"
            >
              Return to Chat
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const SharedConversationView: React.FC<{ token: string }> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    title: string;
    model: string;
    createdAt: string;
    messages: Array<{
      id: number;
      role: string;
      content: string;
      model: string;
      sourcesJson?: ChatSource[];
      createdAt: string;
    }>;
  } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/shared/${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Shared conversation unavailable.');
        }
        if (active) setData(json);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load shared thread.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0D0E12] text-neutral-900 dark:text-neutral-100">
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-[#14151A]/90 backdrop-blur px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="font-display font-semibold text-sm tracking-tight">SUB AI</span>
          <span className="text-xs text-neutral-500">Shared Snapshot</span>
        </div>
        <a
          href="/"
          className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium whitespace-nowrap"
        >
          Open SUB AI
        </a>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {loading && (
          <div className="text-sm text-neutral-500 py-12 text-center">Loading shared thread...</div>
        )}
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        {data && (
          <div className="space-y-6">
            <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
              <h1 className="font-display text-2xl font-semibold">{data.title}</h1>
              <p className="text-xs text-neutral-500 mt-1">
                Model: {data.model} · Shared {new Date(data.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="space-y-5">
              {data.messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === 'user'
                      ? 'ml-auto max-w-[85%] rounded-2xl bg-neutral-200/80 dark:bg-neutral-800 px-4 py-3 text-sm'
                      : 'rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] px-5 py-4'
                  }
                >
                  <div className="text-[11px] font-medium text-neutral-500 mb-1.5">
                    {m.role === 'user' ? 'User' : `Assistant (${m.model || data.model})`}
                  </div>
                  {m.role === 'user' ? (
                    <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  ) : (
                    <MarkdownRenderer content={m.content} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

interface NavItem {
  id: WorkspaceView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'research', label: 'Live Search', icon: Globe },
  { id: 'images', label: 'Image Studio', icon: ImageIcon },
  { id: 'builder', label: 'App Builder', icon: Hammer },
  { id: 'voice', label: 'Voice Studio', icon: Mic },
  { id: 'docs-data', label: 'Docs & Data', icon: FileSpreadsheet },
  { id: 'coding', label: 'Coding Lab', icon: Code2 },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'explore', label: 'Models', icon: Compass },
  { id: 'usage-evals', label: 'Usage & Evals', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const WorkspaceShell: React.FC = () => {
  const {
    firebaseUser,
    profile,
    loading,
    signOut,
    apiFetch,
    refreshProfile,
    setThemeLocal,
  } = useAuth();

  const [view, setView] = useState<WorkspaceView>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingConvId, setEditingConvId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const loadConversations = useCallback(async () => {
    if (!firebaseUser) return;
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (showArchived) params.set('archived', 'true');
    const res = await apiFetch(`/api/conversations?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations || []);
    }
  }, [apiFetch, firebaseUser, searchQuery, showArchived]);

  useEffect(() => {
    if (firebaseUser) {
      const timer = setTimeout(() => {
        void loadConversations();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [firebaseUser, loadConversations]);

  const startNewChat = useCallback((projectId: number | null = null) => {
    setActiveProjectId(projectId);
    setActiveConversationId(null);
    setView('chat');
    setMobileDrawerOpen(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSidebarOpen(true);
        setMobileDrawerOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 40);
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        startNewChat(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startNewChat]);

  const toggleTheme = async () => {
    const next = profile?.theme === 'light' ? 'dark' : 'light';
    setThemeLocal(next);
    await apiFetch('/api/account/me', {
      method: 'PATCH',
      body: JSON.stringify({ theme: next }),
    });
  };

  const handleRenameSubmit = async (id: number) => {
    const clean = editingTitle.trim();
    setEditingConvId(null);
    if (!clean) return;
    await apiFetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: clean }),
    });
    await loadConversations();
  };

  const handleTogglePin = async (conv: ConversationItem) => {
    await apiFetch(`/api/conversations/${conv.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned: !conv.pinned }),
    });
    await loadConversations();
  };

  const handleToggleArchive = async (conv: ConversationItem) => {
    await apiFetch(`/api/conversations/${conv.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: !conv.archived }),
    });
    if (activeConversationId === conv.id && !conv.archived) {
      setActiveConversationId(null);
    }
    await loadConversations();
  };

  const handleDeleteConversation = async (id: number) => {
    await apiFetch(`/api/conversations/${id}`, { method: 'DELETE' });
    if (activeConversationId === id) {
      setActiveConversationId(null);
    }
    await loadConversations();
  };

  const handleTryModel = async (modelId: string) => {
    await apiFetch('/api/account/me', {
      method: 'PATCH',
      body: JSON.stringify({ preferredModel: modelId }),
    });
    await refreshProfile();
    startNewChat(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-[#0D0E12] text-neutral-500 text-sm">
        Initializing SUB AI workspace...
      </div>
    );
  }

  if (!firebaseUser) {
    return <AuthGate />;
  }

  const activeNav = NAV_ITEMS.find((n) => n.id === view) || NAV_ITEMS[0];

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-white dark:bg-[#14151A] border-r border-neutral-200 dark:border-neutral-800">
      <div className="h-14 px-4 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="font-display font-semibold text-sm tracking-tight truncate">
            SUB AI
          </span>
        </div>
        <button
          onClick={() => startNewChat(null)}
          title="New Chat (Ctrl+Shift+N)"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      <div className="p-2.5 space-y-0.5 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setView(item.id);
                setMobileDrawerOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? 'bg-teal-500/15 text-teal-600 dark:text-teal-300'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/70'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="px-3 pt-3 pb-2 space-y-2 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats (Ctrl+K)"
            className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0D0E12] text-xs outline-none focus:border-teal-500"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-neutral-500 px-0.5">
          <span className="font-medium uppercase tracking-wider">
            {showArchived ? 'Archived' : 'Conversations'}
          </span>
          <button
            onClick={() => setShowArchived((s) => !s)}
            className="inline-flex items-center gap-1 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            {showArchived ? (
              <>
                <BookMarked className="w-3 h-3" /> Active
              </>
            ) : (
              <>
                <Bookmark className="w-3 h-3" /> Archived
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-1">
        {conversations.length === 0 ? (
          <div className="text-[11px] text-neutral-500 px-2 py-4 text-center">
            {searchQuery
              ? 'No matching conversations.'
              : showArchived
                ? 'No archived conversations.'
                : 'Start a conversation to build history.'}
          </div>
        ) : (
          conversations.map((conv) => {
            const isSelected = view === 'chat' && activeConversationId === conv.id;
            return (
              <div
                key={conv.id}
                className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                  isSelected
                    ? 'bg-neutral-200/80 dark:bg-neutral-800 text-neutral-900 dark:text-white'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
                }`}
              >
                {editingConvId === conv.id ? (
                  <div className="flex items-center gap-1 w-full">
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRenameSubmit(conv.id);
                        if (e.key === 'Escape') setEditingConvId(null);
                      }}
                      className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-white dark:bg-[#0D0E12] border border-teal-500 text-xs outline-none"
                    />
                    <button
                      onClick={() => void handleRenameSubmit(conv.id)}
                      className="text-teal-500 p-0.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setActiveConversationId(conv.id);
                        setActiveProjectId(conv.projectId);
                        setView('chat');
                        setMobileDrawerOpen(false);
                      }}
                      className="flex-1 min-w-0 text-left flex items-center gap-1.5 truncate"
                    >
                      {conv.pinned && <Pin className="w-3 h-3 text-teal-500 shrink-0" />}
                      <span className="truncate">{conv.title}</span>
                    </button>
                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => {
                          setEditingConvId(conv.id);
                          setEditingTitle(conv.title);
                        }}
                        title="Rename"
                        className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => void handleTogglePin(conv)}
                        title={conv.pinned ? 'Unpin' : 'Pin'}
                        className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      >
                        {conv.pinned ? (
                          <PinOff className="w-3 h-3" />
                        ) : (
                          <Pin className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        onClick={() => void handleToggleArchive(conv)}
                        title={conv.archived ? 'Restore' : 'Archive'}
                        className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      >
                        {conv.archived ? (
                          <ArchiveRestore className="w-3 h-3" />
                        ) : (
                          <Archive className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        onClick={() => void handleDeleteConversation(conv.id)}
                        title="Delete"
                        className="p-1 rounded hover:bg-red-500/15 text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.displayName || 'User'}
              className="w-7 h-7 rounded-full object-cover shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-teal-600/20 text-teal-600 dark:text-teal-300 flex items-center justify-center text-xs font-semibold shrink-0">
              {(profile?.displayName || firebaseUser.email || 'U').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-xs font-medium truncate">
              {profile?.displayName || firebaseUser.displayName || 'Workspace User'}
            </div>
            <div className="text-[11px] text-neutral-500 truncate">{profile?.email}</div>
          </div>
        </div>
        <button
          onClick={() => void signOut()}
          title="Sign out"
          className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-neutral-50 dark:bg-[#0D0E12] text-neutral-900 dark:text-neutral-100">
      {/* Desktop Sidebar */}
      {sidebarOpen && (
        <aside className="hidden md:block w-[264px] shrink-0 h-full">
          {renderSidebarContent()}
        </aside>
      )}

      {/* Mobile Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="w-[272px] h-full shadow-2xl">{renderSidebarContent()}</div>
          <div
            className="flex-1 bg-black/50 backdrop-blur-xs"
            onClick={() => setMobileDrawerOpen(false)}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        <header className="h-14 px-4 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-[#14151A]/80 backdrop-blur flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileDrawerOpen((o) => !o);
                } else {
                  setSidebarOpen((o) => !o);
                }
              }}
              aria-label="Toggle navigation"
              className="p-2 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
            >
              {mobileDrawerOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <activeNav.icon className="w-4 h-4 text-teal-500 shrink-0" />
              <span className="font-display font-semibold text-sm truncate whitespace-nowrap">
                {activeNav.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => void toggleTheme()}
              title="Toggle Dark / Light Theme"
              className="p-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
            >
              {profile?.theme === 'light' ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => startNewChat(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-hidden">
          <WorkspaceErrorBoundary onReset={() => setView('chat')}>
            {view === 'chat' && (
              <ChatWorkspace
                conversationId={activeConversationId}
                projectId={activeProjectId}
                onSelectConversation={(id) => setActiveConversationId(id)}
                onConversationsChanged={() => void loadConversations()}
              />
            )}
            {view === 'research' && <ResearchView />}
            {view === 'images' && <ImageStudioView />}
            {view === 'builder' && <AppBuilderView />}
            {view === 'voice' && <VoiceStudioView />}
            {view === 'docs-data' && <DocsAndDataView />}
            {view === 'coding' && <CodingView />}
            {view === 'projects' && (
              <ProjectsView
                onStartProjectChat={(projectId) => startNewChat(projectId)}
                onOpenConversation={(convId) => {
                  setActiveConversationId(convId);
                  setView('chat');
                }}
              />
            )}
            {view === 'memory' && <MemoryView />}
            {view === 'explore' && (
              <ExploreModelsView onTryModel={(modelId) => void handleTryModel(modelId)} />
            )}
            {view === 'usage-evals' && <UsageAndEvalsView />}
            {view === 'settings' && <SettingsView />}
          </WorkspaceErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default function App() {
  const shareToken =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('share')
      : null;

  if (shareToken) {
    return <SharedConversationView token={shareToken} />;
  }

  return (
    <AuthProvider>
      <WorkspaceShell />
    </AuthProvider>
  );
}
