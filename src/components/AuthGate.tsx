import React from 'react';
import {
  ArrowRight,
  Code2,
  FileSearch,
  Globe,
  Image as ImageIcon,
  Layers,
  Mic,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const AuthGate: React.FC = () => {
  const { signInWithGoogle, authError } = useAuth();

  const pillars = [
    {
      icon: Layers,
      title: 'Multi-Model Reasoning',
      desc: 'Stream across Gemini 4, OpenAI, Anthropic, xAI, and local Ollama models with branching history.',
    },
    {
      icon: Globe,
      title: 'Live Search & Deep Research',
      desc: 'Multi-step web retrieval with domain reliability tiers, page inspection, and clickable citations.',
    },
    {
      icon: ImageIcon,
      title: 'Image Studio & Visual Q&A',
      desc: 'Text-to-image, reference editing, aspect presets, prompt enhancement, and visual inspection.',
    },
    {
      icon: Code2,
      title: 'Autonomous App Builder',
      desc: 'Generate runnable React + TypeScript workspaces with isolated bundling, checkpoints, and ZIP export.',
    },
    {
      icon: FileSearch,
      title: 'Document & Data Intelligence',
      desc: 'Extract PDF, DOCX, XLSX, CSV, PPTX, and code; profile datasets and chart trends safely.',
    },
    {
      icon: Mic,
      title: 'Live Voice & Transcription',
      desc: 'Real-time duplex WebSocket audio sessions separated cleanly from batch transcription and TTS.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F8F7] dark:bg-[#0C0D10] text-[#14151A] dark:text-[#F2F2F0] flex flex-col justify-between px-6 py-10">
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between">
        <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
          SUB AI
        </span>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
        >
          Sign in with Google
        </button>
      </header>

      <main className="max-w-5xl w-full mx-auto my-12">
        <div className="max-w-2xl">
          <p className="text-xs font-medium tracking-wide text-neutral-500 dark:text-neutral-400 mb-3">
            Independent Multi-Model AI Workspace
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.12] text-balance">
            Reason, research, design, and build software in one unified environment.
          </h1>
          <p className="mt-4 text-base text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-xl">
            SUB AI brings together streaming multi-provider chat, grounded web research, studio image generation, document analysis, live voice, and an isolated application builder backed by PostgreSQL persistence.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={signInWithGoogle}
              className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-lg bg-[#14151A] text-white dark:bg-[#D4B483] dark:text-[#0C0D10] text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Continue with Google</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="inline-flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <ShieldCheck className="w-4 h-4 text-[#B8893A] dark:text-[#D4B483]" />
              <span>Encrypted BYOK key vault · Per-user isolated workspace</span>
            </div>
          </div>

          {authError && (
            <div className="mt-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-600 dark:text-red-300">
              {authError}
            </div>
          )}
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pillars.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800/90 bg-white dark:bg-[#14151A]"
              >
                <Icon className="w-5 h-5 text-[#B8893A] dark:text-[#D4B483] mb-3" />
                <h2 className="font-display text-sm font-semibold">{item.title}</h2>
                <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="max-w-6xl w-full mx-auto text-xs text-neutral-500 dark:text-neutral-500 flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800/80 pt-5">
        <span>SUB AI Platform</span>
        <span>PostgreSQL + Multi-Provider Architecture</span>
      </footer>
    </div>
  );
};
