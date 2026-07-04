/**
 * KnowledgeLayout
 *
 * Shared layout for static in-app guide pages (e.g. AdminGuide).
 * Provides:
 *  - Left sidebar with section navigation + search
 *  - Main content panel that renders HTML strings
 *  - Responsive: sidebar collapses on mobile with a toggle
 *
 * Does NOT use DOMPurify — content must come from trusted static sources
 * authored in src/data/knowledgeBase.ts. Never render user-supplied HTML here.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { KBSection } from '../data/knowledgeBase';
import { Search, Menu, X, ChevronRight } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface KnowledgeLayoutProps {
  title: string;
  subtitle?: string;
  sections: KBSection[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function KnowledgeLayout({ title, subtitle, sections }: KnowledgeLayoutProps) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // ── Filter sections by search query ─────────────────────────────────────
  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase();
    return sections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q),
    );
  }, [search, sections]);

  // ── When active section changes, scroll content to top ─────────────────
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeId]);

  // ── If current active is filtered out, select first visible ─────────────
  useEffect(() => {
    if (filteredSections.length > 0 && !filteredSections.find((s) => s.id === activeId)) {
      setActiveId(filteredSections[0].id);
    }
  }, [filteredSections, activeId]);

  const activeSection = sections.find((s) => s.id === activeId);

  // ── Sidebar content (shared between desktop + mobile overlay) ───────────
  const sidebar = (
    <div className="flex flex-col h-full bg-[#0f0f10] border-r border-white/[0.06]">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-white/[0.06] flex-shrink-0">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-[#b8933a] mb-1">
          {subtitle ?? 'Guide'}
        </p>
        <h2 className="text-sm font-bold text-white leading-tight">{title}</h2>
      </div>

      {/* Search */}
      <div className="px-3 py-3 flex-shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555550] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sections…"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#c8c8c4] placeholder-[#555550] focus:outline-none focus:ring-1 focus:ring-[#b8933a]/50"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#555550] hover:text-[#c8c8c4]"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5 scrollbar-none">
        {filteredSections.length === 0 && (
          <p className="text-xs text-[#555550] text-center py-6">No results for "{search}"</p>
        )}
        {filteredSections.map((section) => {
          const isActive = section.id === activeId;
          return (
            <button
              key={section.id}
              onClick={() => {
                setActiveId(section.id);
                setMobileSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-all ${
                isActive
                  ? 'bg-[#b8933a]/15 text-[#e6c568]'
                  : 'text-[#8a8a84] hover:text-[#c8c8c4] hover:bg-white/[0.04]'
              }`}
              style={isActive ? { borderLeft: '2px solid #b8933a', paddingLeft: '10px' } : { borderLeft: '2px solid transparent', paddingLeft: '10px' }}
            >
              <span className="text-sm flex-shrink-0">{section.emoji}</span>
              <span className="leading-snug truncate">{section.title}</span>
              {isActive && <ChevronRight size={11} className="ml-auto flex-shrink-0 text-[#b8933a]" />}
            </button>
          );
        })}
      </nav>

      {/* Section count */}
      <div className="px-4 py-3 border-t border-white/[0.06] flex-shrink-0">
        <p className="text-[10px] text-[#555550]">
          {filteredSections.length} of {sections.length} sections
          {search && ` matching "${search}"`}
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-56 xl:w-64 flex-shrink-0 flex-col overflow-hidden">
        {sidebar}
      </aside>

      {/* ── Mobile sidebar overlay ───────────────────────────────────────── */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 max-w-[80vw] flex flex-col overflow-hidden lg:hidden">
            {sidebar}
          </aside>
        </>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-[var(--bg)]">
        {/* Mobile topbar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
          >
            <Menu size={16} />
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
            {activeSection ? `${activeSection.emoji} ${activeSection.title}` : title}
          </span>
        </div>

        {/* Scrollable content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto">
          {activeSection ? (
            <div className="max-w-3xl mx-auto px-6 sm:px-8 py-8 sm:py-10">
              {/* Section header */}
              <div className="flex items-center gap-3 mb-6 pb-5 border-b border-gray-200 dark:border-slate-700">
                <span className="text-3xl">{activeSection.emoji}</span>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                    {activeSection.title}
                  </h1>
                  <p className="text-xs text-gray-400 dark:text-[#7a7a74] mt-0.5">{title}</p>
                </div>
              </div>

              {/* Rendered HTML content */}
              <div
                className="kb-content prose prose-sm dark:prose-invert max-w-none"
                // Safe: content is static, authored in src/data/knowledgeBase.ts
                dangerouslySetInnerHTML={{ __html: activeSection.content }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-[#555550]">
              <p className="text-sm">Select a section from the sidebar</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Inline styles for kb-content ─────────────────────────────────── */}
      <style>{`
        .kb-content h2 {
          font-size: 1.25rem;
          font-weight: 700;
          margin-top: 1.75rem;
          margin-bottom: 0.75rem;
          color: inherit;
        }
        .kb-content h2:first-child {
          margin-top: 0;
        }
        .kb-content h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
          color: inherit;
        }
        .kb-content p {
          margin-bottom: 0.75rem;
          line-height: 1.65;
          font-size: 0.875rem;
        }
        .kb-content ul,
        .kb-content ol {
          padding-left: 1.25rem;
          margin-bottom: 0.75rem;
          font-size: 0.875rem;
        }
        .kb-content li {
          margin-bottom: 0.35rem;
          line-height: 1.6;
        }
        .kb-content code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.8em;
          padding: 0.15em 0.4em;
          border-radius: 4px;
          background: rgba(184,147,58,0.12);
          color: #c9a84c;
        }
        .dark .kb-content code {
          background: rgba(184,147,58,0.15);
          color: #e6c568;
        }
        .kb-content pre {
          background: rgba(0,0,0,0.06);
          border-radius: 8px;
          padding: 0.875rem 1rem;
          overflow-x: auto;
          margin-bottom: 0.75rem;
        }
        .dark .kb-content pre {
          background: rgba(255,255,255,0.04);
        }
        .kb-content pre code {
          background: none;
          color: #b8933a;
          padding: 0;
          font-size: 0.82rem;
        }
        .kb-content table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1rem;
          font-size: 0.8rem;
        }
        .kb-content th {
          text-align: left;
          padding: 0.5rem 0.75rem;
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          background: rgba(0,0,0,0.04);
          border-bottom: 1px solid rgba(0,0,0,0.1);
        }
        .dark .kb-content th {
          background: rgba(255,255,255,0.04);
          border-bottom-color: rgba(255,255,255,0.08);
          color: #9a9a94;
        }
        .kb-content td {
          padding: 0.45rem 0.75rem;
          border-bottom: 1px solid rgba(0,0,0,0.06);
          vertical-align: top;
        }
        .dark .kb-content td {
          border-bottom-color: rgba(255,255,255,0.05);
        }
        .kb-content tr:last-child td {
          border-bottom: none;
        }
        .kb-content hr {
          border: none;
          border-top: 1px solid rgba(0,0,0,0.1);
          margin: 1.5rem 0;
        }
        .dark .kb-content hr {
          border-top-color: rgba(255,255,255,0.07);
        }
        .kb-content strong {
          font-weight: 600;
        }
        .kb-content blockquote {
          border-left: 3px solid #b8933a;
          padding-left: 1rem;
          margin: 0.75rem 0;
          color: #6b7280;
          font-style: italic;
          font-size: 0.875rem;
        }
        .dark .kb-content blockquote {
          color: #9ca3af;
        }
        .kb-content kbd {
          display: inline-flex;
          align-items: center;
          padding: 0.1em 0.45em;
          border-radius: 4px;
          border: 1px solid rgba(0,0,0,0.18);
          background: rgba(0,0,0,0.05);
          font-family: ui-monospace, monospace;
          font-size: 0.78em;
          color: inherit;
        }
        .dark .kb-content kbd {
          border-color: rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
        }
        .kb-content dl dt {
          font-weight: 600;
          margin-top: 0.75rem;
          font-size: 0.875rem;
        }
        .kb-content dl dd {
          margin-left: 1.25rem;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          line-height: 1.6;
          color: #4b5563;
        }
        .dark .kb-content dl dd {
          color: #9ca3af;
        }
      `}</style>
    </div>
  );
}
