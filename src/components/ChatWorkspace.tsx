import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Mic,
  MicOff,
  Paperclip,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Share2,
  SlidersHorizontal,
  Square,
  ThumbsDown,
  ThumbsUp,
  Timer,
  Volume2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { ChatMessage, ChatSource, ConversationItem, UploadedFileItem } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatWorkspaceProps {
  conversationId: number | null;
  projectId: number | null;
  onSelectConversation: (id: number | null) => void;
  onConversationsChanged: () => void;
}

function buildActiveLineage(allMessages: ChatMessage[], leafId: number | null): ChatMessage[] {
  if (allMessages.length === 0) return [];
  const byId = new Map(allMessages.map((m) => [m.id, m]));
  let cursor = leafId ? byId.get(leafId) : allMessages[allMessages.length - 1];
  if (!cursor) cursor = allMessages[allMessages.length - 1];
  const chain: ChatMessage[] = [];
  const seen = new Set<number>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return chain.reverse();
}

function findDeepestLeaf(allMessages: ChatMessage[], startId: number): number {
  let current = startId;
  while (true) {
    const children = allMessages.filter((m) => m.parentId === current);
    if (children.length === 0) return current;
    current = children[children.length - 1].id;
  }
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  conversationId,
  projectId,
  onSelectConversation,
  onConversationsChanged,
}) => {
  const { apiFetch, models, profile } = useAuth();

  const [conv, setConv] = useState<ConversationItem | null>(null);
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([]);
  const [summaryText, setSummaryText] = useState('');
  const [loadingConv, setLoadingConv] = useState(false);

  const [selectedModel, setSelectedModel] = useState(profile?.preferredModel || 'gemini-4-hydrogen');
  const [thinkingLevel, setThinkingLevel] = useState<'auto' | 'low' | 'medium' | 'high' | 'xhigh'>('auto');
  const [webSearch, setWebSearch] = useState(false);
  const [isTemporary, setIsTemporary] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showSystemDrawer, setShowSystemDrawer] = useState(false);

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamThinking, setStreamThinking] = useState('');
  const [streamSources, setStreamSources] = useState<ChatSource[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [editingMsgId, setEditingMsgId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Record<number, boolean>>({});

  // Attachments & Voice
  const [libraryFiles, setLibraryFiles] = useState<UploadedFileItem[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);
  const [inlineImages, setInlineImages] = useState<
    Array<{ name: string; mimeType: string; base64Data: string }>
  >([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [recordingMic, setRecordingMic] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Share modal
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const activeModelSpec = useMemo(
    () => models.find((m) => m.id === selectedModel),
    [models, selectedModel],
  );

  useEffect(() => {
    if (!conversationId) {
      setConv(null);
      setAllMessages([]);
      setSummaryText('');
      setSystemPrompt('');
      return;
    }
    let cancelled = false;
    setLoadingConv(true);
    setErrorMsg(null);
    apiFetch(`/api/conversations/${conversationId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed to load conversation');
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setConv(data.conversation);
        setAllMessages(data.messages || []);
        setSummaryText(data.summary || '');
        if (data.conversation?.model) setSelectedModel(data.conversation.model);
        setSystemPrompt(data.conversation?.systemPrompt || '');
        setIsTemporary(Boolean(data.conversation?.isTemporary));
      })
      .catch((err) => {
        if (!cancelled) setErrorMsg(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingConv(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length, streamText]);

  const activeMessages = useMemo(
    () => buildActiveLineage(allMessages, conv?.activeLeafMessageId ?? null),
    [allMessages, conv?.activeLeafMessageId],
  );

  const loadLibraryFiles = async () => {
    const res = await apiFetch('/api/files');
    if (res.ok) {
      const data = await res.json();
      setLibraryFiles(data.files || []);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const runStreamRequest = async (payload: Record<string, unknown>) => {
    setErrorMsg(null);
    setStreaming(true);
    setStreamText('');
    setStreamThinking('');
    setStreamSources([]);

    const controller = new AbortController();
    abortRef.current = controller;

    let resolvedConvId = conv?.id ?? conversationId ?? null;

    try {
      const res = await apiFetch('/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          model: selectedModel,
          thinkingLevel:
            thinkingLevel !== 'auto' && activeModelSpec?.capabilities.thinking
              ? thinkingLevel
              : undefined,
          enableWebSearch: webSearch && Boolean(activeModelSpec?.capabilities.webGrounding),
          isTemporary,
          systemPrompt,
          projectId: conv?.projectId ?? projectId ?? null,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Chat request failed.');
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
          let eventName = 'message';
          let dataLine = '';
          for (const line of lines) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            if (line.startsWith('data:')) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          const parsed = JSON.parse(dataLine);

          if (eventName === 'meta') {
            resolvedConvId = parsed.conversationId;
            if (!conversationId && resolvedConvId) {
              onSelectConversation(resolvedConvId);
            }
          } else if (eventName === 'user_message') {
            setAllMessages((prev) => [...prev, parsed.message]);
          } else if (eventName === 'delta') {
            setStreamText((prev) => prev + (parsed.text || ''));
          } else if (eventName === 'thinking') {
            setStreamThinking((prev) => prev + (parsed.text || ''));
          } else if (eventName === 'source') {
            setStreamSources((prev) => [...prev, parsed]);
          } else if (eventName === 'done') {
            if (resolvedConvId) {
              const refresh = await apiFetch(`/api/conversations/${resolvedConvId}`);
              if (refresh.ok) {
                const full = await refresh.json();
                setConv(full.conversation);
                setAllMessages(full.messages || []);
                setSummaryText(full.summary || '');
              }
            }
            onConversationsChanged();
          } else if (eventName === 'error') {
            setErrorMsg(parsed.message || 'Generation error');
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setErrorMsg(err instanceof Error ? err.message : 'Streaming interrupted.');
      } else if (resolvedConvId) {
        const refresh = await apiFetch(`/api/conversations/${resolvedConvId}`);
        if (refresh.ok) {
          const full = await refresh.json();
          setConv(full.conversation);
          setAllMessages(full.messages || []);
        }
      }
    } finally {
      setStreaming(false);
      setStreamText('');
      setStreamThinking('');
      setStreamSources([]);
      abortRef.current = null;
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (streaming || (!input.trim() && selectedFileIds.length === 0 && inlineImages.length === 0)) {
      return;
    }
    const text = input.trim();
    const fIds = [...selectedFileIds];
    const imgs = [...inlineImages];
    setInput('');
    setSelectedFileIds([]);
    setInlineImages([]);

    await runStreamRequest({
      conversationId: conv?.id ?? conversationId ?? null,
      message: text || 'Analyze the attached files.',
      fileIds: fIds,
      inlineImages: imgs,
    });
  };

  const handleSaveEditAndBranch = async (msg: ChatMessage) => {
    if (!editingText.trim() || streaming) return;
    const updatedText = editingText.trim();
    setEditingMsgId(null);
    setEditingText('');
    await runStreamRequest({
      conversationId: msg.conversationId,
      parentId: msg.parentId,
      message: updatedText,
    });
  };

  const handleRegenerate = async (msg: ChatMessage) => {
    if (streaming) return;
    await runStreamRequest({
      conversationId: msg.conversationId,
      regenerateFromMessageId: msg.id,
      message: '',
    });
  };

  const handleContinue = async (msg: ChatMessage) => {
    if (streaming) return;
    await runStreamRequest({
      conversationId: msg.conversationId,
      continueMessageId: msg.id,
      message: '',
    });
  };

  const switchBranch = async (siblings: ChatMessage[], targetIndex: number) => {
    if (!conv || targetIndex < 0 || targetIndex >= siblings.length) return;
    const chosen = siblings[targetIndex];
    const leafId = findDeepestLeaf(allMessages, chosen.id);
    setConv({ ...conv, activeLeafMessageId: leafId });
    await apiFetch(`/api/conversations/${conv.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ activeLeafMessageId: leafId }),
    });
  };

  const handleFeedback = async (msgId: number, val: 'up' | 'down') => {
    const target = allMessages.find((m) => m.id === msgId);
    const nextVal = target?.feedback === val ? null : val;
    setAllMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, feedback: nextVal } : m)));
    await apiFetch(`/api/messages/${msgId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ feedback: nextVal }),
    });
  };

  const handleReadAloud = async (text: string) => {
    try {
      const res = await apiFetch('/api/voice/tts', {
        method: 'POST',
        body: JSON.stringify({ text: text.slice(0, 1800), voiceName: 'Kore' }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.audioDataUrl) {
        const audio = new Audio(data.audioDataUrl);
        await audio.play();
      }
    } catch {
      // ignore playback cancellation
    }
  };

  const toggleMicDictation = async () => {
    if (recordingMic) {
      mediaRecorderRef.current?.stop();
      setRecordingMic(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const b64 = btoa(bin);
        const res = await apiFetch('/api/voice/transcribe', {
          method: 'POST',
          body: JSON.stringify({ mimeType: blob.type || 'audio/webm', base64Audio: b64 }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.transcript) {
            setInput((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript));
          }
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingMic(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Microphone permission denied.');
    }
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const base64 = res.split(',')[1] || '';
      setInlineImages((prev) => [
        ...prev.slice(0, 2),
        { name: file.name, mimeType: file.type || 'image/png', base64Data: base64 },
      ]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const toggleShare = async () => {
    if (!conv) return;
    const res = await apiFetch(`/api/conversations/${conv.id}/share`, {
      method: 'POST',
      body: JSON.stringify({ isShared: !conv.isShared }),
    });
    if (res.ok) {
      const data = await res.json();
      setConv({ ...conv, isShared: data.isShared, shareToken: data.shareToken });
    }
  };

  const exportChat = async (format: 'md' | 'json') => {
    if (!conv) return;
    const res = await apiFetch(`/api/conversations/${conv.id}/export?format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sub-ai-chat-${conv.id}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const starterPrompts = [
    'Design a PostgreSQL schema for a multi-tenant SaaS billing engine and explain isolation trade-offs.',
    'Search current TypeScript 7 compiler developments and summarize key changes with citations.',
    'Write a deterministic binary search in TypeScript with comprehensive unit tests.',
    'Explain Bayes theorem with KaTeX equations and a concrete medical testing example.',
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Workspace Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-neutral-200 dark:border-neutral-800/80 bg-white/70 dark:bg-[#111216]/90">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              aria-label="Select AI Model"
              className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#181A20] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-[#D4B483]"
            >
              {models
                .filter((m) => !m.capabilities.imageGen)
                .map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.available}>
                    {m.displayName} {!m.available ? '(Key Required)' : ''}
                  </option>
                ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400" />
          </div>

          {activeModelSpec?.capabilities.thinking && (
            <select
              value={thinkingLevel}
              onChange={(e) => setThinkingLevel(e.target.value as typeof thinkingLevel)}
              aria-label="Reasoning depth"
              className="px-2.5 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#181A20] text-neutral-700 dark:text-neutral-300"
            >
              <option value="auto">Thinking: Auto</option>
              <option value="low">Thinking: Low</option>
              <option value="medium">Thinking: Medium</option>
              <option value="high">Thinking: High</option>
              {(selectedModel === 'gemini-4-hydrogen' || selectedModel === 'gemini-4-neon') && (
                <option value="xhigh">Thinking: XHigh</option>
              )}
            </select>
          )}

          <button
            type="button"
            onClick={() => setWebSearch((w) => !w)}
            disabled={!activeModelSpec?.capabilities.webGrounding}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              webSearch
                ? 'border-[#B8893A] dark:border-[#D4B483] bg-[#D4B483]/15 text-[#9A6E24] dark:text-[#D4B483]'
                : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            } disabled:opacity-40`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Web</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTemporary((t) => !t)}
            disabled={Boolean(conv)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isTemporary
                ? 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400'
            } disabled:opacity-50`}
            title="Temporary chats are excluded from saved memory and expire after 24h"
          >
            <Timer className="w-3.5 h-3.5" />
            <span>Temporary</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSystemDrawer((s) => !s)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 cursor-pointer whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>System Prompt</span>
          </button>
        </div>

        {conv && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportChat('md')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export MD</span>
            </button>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>
          </div>
        )}
      </div>

      {showSystemDrawer && (
        <div className="px-4 sm:px-6 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#14151A]">
          <div className="max-w-4xl mx-auto flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>Conversation System Instructions</span>
              {conv && (
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/conversations/${conv.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ systemPrompt }),
                    });
                    setShowSystemDrawer(false);
                  }}
                  className="text-[#B8893A] dark:text-[#D4B483] font-medium cursor-pointer"
                >
                  Save to thread
                </button>
              )}
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={2}
              placeholder="Optional persona, formatting rules, or constraints for this conversation..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0C0D10] focus:outline-none focus:ring-1 focus:ring-[#D4B483]"
            />
          </div>
        </div>
      )}

      {/* Message Stream Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {summaryText && (
            <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#14151A] text-xs text-neutral-600 dark:text-neutral-400">
              <div className="font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                Compressed Earlier Context
              </div>
              <p className="leading-relaxed">{summaryText}</p>
            </div>
          )}

          {loadingConv && (
            <div className="py-12 text-center text-sm text-neutral-500">Loading conversation...</div>
          )}

          {!loadingConv && activeMessages.length === 0 && !streaming && (
            <div className="py-12">
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                How can SUB AI help today?
              </h2>
              <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                Select a model above, attach documents or images, or enable Web grounding for live citations.
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {starterPrompts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setInput(p)}
                    className="p-4 text-left text-xs leading-relaxed rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] hover:border-[#D4B483]/60 transition-colors cursor-pointer"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeMessages.map((msg) => {
            const siblings = allMessages.filter((m) => m.parentId === msg.parentId);
            const siblingIdx = siblings.findIndex((m) => m.id === msg.id);
            const isUser = msg.role === 'user';

            return (
              <div
                key={msg.id}
                className={`group flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-full ${
                    isUser
                      ? 'sm:max-w-[85%] rounded-2xl px-4 py-3 bg-[#14151A] text-white dark:bg-[#1E2028] dark:text-neutral-100 border border-neutral-800'
                      : 'w-full'
                  }`}
                >
                  {!isUser && (
                    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                      <span className="font-medium text-neutral-800 dark:text-neutral-200">
                        {msg.model || 'SUB AI'}
                      </span>
                      {msg.stopped && (
                        <>
                          <span>·</span>
                          <span className="text-amber-500">Stopped early</span>
                        </>
                      )}
                      {msg.usageJson?.latencyMs ? (
                        <>
                          <span>·</span>
                          <span className="font-mono tabular-nums">
                            {(Number(msg.usageJson.latencyMs) / 1000).toFixed(1)}s
                          </span>
                        </>
                      ) : null}
                    </div>
                  )}

                  {msg.attachmentsJson && msg.attachmentsJson.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2 text-xs opacity-80">
                      {msg.attachmentsJson.map((att, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />
                          <span>{att.name}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {!isUser && msg.thinkingText && (
                    <div className="mb-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedThinking((p) => ({ ...p, [msg.id]: !p[msg.id] }))
                        }
                        className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
                      >
                        <Brain className="w-3.5 h-3.5 text-[#B8893A] dark:text-[#D4B483]" />
                        <span>
                          {expandedThinking[msg.id] ? 'Hide reasoning trace' : 'Show reasoning trace'}
                        </span>
                      </button>
                      {expandedThinking[msg.id] && (
                        <div className="mt-2 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#14151A] text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap font-mono">
                          {msg.thinkingText}
                        </div>
                      )}
                    </div>
                  )}

                  {editingMsgId === msg.id ? (
                    <div className="space-y-2 min-w-[260px]">
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        rows={3}
                        className="w-full p-2.5 rounded-lg bg-white text-neutral-900 dark:bg-[#0C0D10] dark:text-neutral-100 border border-neutral-600 text-sm"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingMsgId(null)}
                          className="px-3 py-1 text-xs rounded-md bg-neutral-700 text-white cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEditAndBranch(msg)}
                          className="px-3 py-1 text-xs rounded-md bg-[#D4B483] text-[#0C0D10] font-semibold cursor-pointer"
                        >
                          Save & Branch
                        </button>
                      </div>
                    </div>
                  ) : isUser ? (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}

                  {!isUser && msg.sourcesJson && msg.sourcesJson.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800/80">
                      <div className="text-xs font-medium text-neutral-500 mb-1.5">
                        Retrieved Sources
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {msg.sourcesJson.map((s, i) => (
                          <a
                            key={i}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#B8893A] dark:text-[#D4B483] hover:underline"
                          >
                            <span>[{i + 1}] {s.title || s.domain}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Message Action Row + Branch Navigator */}
                <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-500">
                  {siblings.length > 1 && (
                    <div className="inline-flex items-center gap-1 mr-2 font-mono tabular-nums">
                      <button
                        type="button"
                        disabled={siblingIdx <= 0}
                        onClick={() => switchBranch(siblings, siblingIdx - 1)}
                        className="p-0.5 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span>
                        {siblingIdx + 1}/{siblings.length}
                      </span>
                      <button
                        type="button"
                        disabled={siblingIdx >= siblings.length - 1}
                        onClick={() => switchBranch(siblings, siblingIdx + 1)}
                        className="p-0.5 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(msg.content);
                      setCopiedId(msg.id);
                      setTimeout(() => setCopiedId(null), 1500);
                    }}
                    className="p-1 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                    title="Copy message"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {isUser ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMsgId(msg.id);
                        setEditingText(msg.content);
                      }}
                      className="p-1 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                      title="Edit message and branch"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRegenerate(msg)}
                        className="p-1 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                        title="Regenerate response"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      {msg.stopped && (
                        <button
                          type="button"
                          onClick={() => handleContinue(msg)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                        >
                          <Play className="w-3 h-3" />
                          <span>Continue</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleReadAloud(msg.content)}
                        className="p-1 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                        title="Read aloud (TTS)"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(msg.id, 'up')}
                        className={`p-1 cursor-pointer ${
                          msg.feedback === 'up'
                            ? 'text-emerald-500'
                            : 'hover:text-neutral-900 dark:hover:text-white'
                        }`}
                        title="Good response"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(msg.id, 'down')}
                        className={`p-1 cursor-pointer ${
                          msg.feedback === 'down'
                            ? 'text-red-500'
                            : 'hover:text-neutral-900 dark:hover:text-white'
                        }`}
                        title="Needs improvement"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {streaming && (
            <div className="w-full">
              <div className="text-xs text-neutral-500 mb-2">
                {activeModelSpec?.displayName || selectedModel} · Streaming
              </div>
              {streamThinking && (
                <div className="mb-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#14151A] text-xs text-neutral-500 font-mono whitespace-pre-wrap">
                  {streamThinking}
                </div>
              )}
              {streamText ? (
                <MarkdownRenderer content={streamText} />
              ) : (
                <div className="text-sm text-neutral-500">Generating response...</div>
              )}
              {streamSources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#D4B483]">
                  {streamSources.map((s, idx) => (
                    <span key={idx}>[{idx + 1}] {s.domain}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="px-4 sm:px-6 pb-4 pt-2 border-t border-neutral-200 dark:border-neutral-800/80 bg-white dark:bg-[#0C0D10]">
        <form onSubmit={handleSend} className="max-w-3xl mx-auto">
          {(selectedFileIds.length > 0 || inlineImages.length > 0) && (
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedFileIds.map((id) => {
                const f = libraryFiles.find((x) => x.id === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 text-xs"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{f?.originalName || `File #${id}`}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFileIds((p) => p.filter((x) => x !== id))}
                      className="cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
              {inlineImages.map((img, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 text-xs"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>{img.name}</span>
                  <button
                    type="button"
                    onClick={() => setInlineImages((p) => p.filter((_, idx) => idx !== i))}
                    className="cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {showAttachMenu && (
            <div className="mb-2 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#14151A] text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Attach from Document Library</span>
                <button
                  type="button"
                  onClick={() => setShowAttachMenu(false)}
                  className="text-neutral-500 cursor-pointer"
                >
                  Close
                </button>
              </div>
              {libraryFiles.length === 0 ? (
                <p className="text-neutral-500">
                  No uploaded documents yet. Upload files in the Documents & Data workspace.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                  {libraryFiles.map((f) => {
                    const active = selectedFileIds.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() =>
                          setSelectedFileIds((p) =>
                            active ? p.filter((x) => x !== f.id) : [...p, f.id],
                          )
                        }
                        className={`px-2.5 py-1 rounded-md border cursor-pointer ${
                          active
                            ? 'border-[#D4B483] bg-[#D4B483]/15 text-[#D4B483]'
                            : 'border-neutral-300 dark:border-neutral-700'
                        }`}
                      >
                        {f.originalName}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#14151A] p-2.5 focus-within:border-[#D4B483]/70 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={2}
              placeholder="Ask SUB AI anything... (Enter to send, Shift+Enter for new line)"
              className="w-full resize-none bg-transparent px-2 py-1 text-sm focus:outline-none"
            />
            <div className="flex items-center justify-between pt-2 px-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    void loadLibraryFiles();
                    setShowAttachMenu((s) => !s);
                  }}
                  className="p-2 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800 cursor-pointer"
                  title="Attach library document"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="p-2 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800 cursor-pointer"
                  title="Attach image"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImagePick}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={toggleMicDictation}
                  className={`p-2 rounded-lg cursor-pointer ${
                    recordingMic
                      ? 'bg-red-500/15 text-red-500'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800'
                  }`}
                  title={recordingMic ? 'Stop dictation' : 'Voice dictation'}
                >
                  {recordingMic ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>

              {streaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-500 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() && selectedFileIds.length === 0 && inlineImages.length === 0}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Share Modal */}
      {shareOpen && conv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#14151A] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">Share Conversation</h3>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              {conv.isShared
                ? 'Anyone with this read-only link can inspect the conversation.'
                : 'Sharing is currently disabled for this conversation.'}
            </p>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={toggleShare}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] cursor-pointer"
              >
                {conv.isShared ? 'Revoke Public Link' : 'Enable Public Link'}
              </button>
              {conv.isShared && conv.shareToken && (
                <button
                  type="button"
                  onClick={async () => {
                    const url = `${window.location.origin}/?share=${conv.shareToken}`;
                    await navigator.clipboard.writeText(url);
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 1800);
                  }}
                  className="px-3 py-2 rounded-lg text-xs border border-neutral-300 dark:border-neutral-700 cursor-pointer"
                >
                  {shareCopied ? 'Copied Link' : 'Copy Link'}
                </button>
              )}
            </div>
            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex gap-2">
              <button
                type="button"
                onClick={() => exportChat('md')}
                className="px-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 cursor-pointer"
              >
                Download Markdown
              </button>
              <button
                type="button"
                onClick={() => exportChat('json')}
                className="px-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 cursor-pointer"
              >
                Download JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
