import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import hljs from 'highlight.js';
import { Check, Copy } from 'lucide-react';

function renderHighlightedNodes(code: string, language?: string): React.ReactNode {
  try {
    const html =
      language && hljs.getLanguage(language)
        ? hljs.highlight(code, { language }).value
        : hljs.highlightAuto(code).value;

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return code;

    let keyIdx = 0;
    const walk = (node: ChildNode): React.ReactNode => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const cls = el.getAttribute('class') || undefined;
        const children = Array.from(el.childNodes).map(walk);
        return (
          <span key={keyIdx++} className={cls}>
            {children}
          </span>
        );
      }
      return null;
    };

    return Array.from(root.childNodes).map(walk);
  } catch {
    return code;
  }
}

const CodeBlock: React.FC<{ language?: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-[#111318] text-neutral-100">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#181A20] border-b border-neutral-800 text-xs text-neutral-400">
        <span className="font-mono">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-neutral-800 text-neutral-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[13px] leading-relaxed font-mono">
        <code>{renderHighlightedNodes(code, language)}</code>
      </pre>
    </div>
  );
};

function isSafeHref(href?: string): boolean {
  if (!href) return false;
  try {
    const parsed = new URL(href, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  return (
    <div className="sub-prose break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, trust: false }]]}
        skipHtml
        components={{
          a({ href, children }) {
            if (!isSafeHref(href)) {
              return <span className="underline decoration-dotted">{children}</span>;
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#B8893A] dark:text-[#D4B483] underline underline-offset-2 hover:opacity-80"
              >
                {children}
              </a>
            );
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const text = String(children).replace(/\n$/, '');
            const isBlock = Boolean(match) || text.includes('\n');
            if (isBlock) {
              return <CodeBlock language={match?.[1]} code={text} />;
            }
            return (
              <code
                className="px-1.5 py-0.5 rounded bg-neutral-200/70 dark:bg-neutral-800 font-mono text-[13px]"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
