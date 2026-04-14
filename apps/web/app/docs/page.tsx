'use client';

/**
 * Docs dock — in-UI documentation viewer.
 *
 * Renders markdown files served by the API's /docs endpoint.
 * URL state: ?doc=<slug> selects which doc to show. Default is the
 * first entry in the returned list.
 *
 * Uses react-markdown + remark-gfm for rendering. Styles come from
 * globals.css (search for `.docsDock`, `.docsSidebar`, `.docsContent`).
 *
 * Next.js note: useSearchParams() requires a <Suspense> boundary so
 * static prerender can CSR-bail cleanly. The default export is a thin
 * wrapper around DocsPageInner so Next can split the boundary.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchDocsList, fetchDoc, type DocListEntry, type DocContent } from '../_lib/api';

type Grouped = Record<string, DocListEntry[]>;

function groupDocs(docs: DocListEntry[]): Array<{ group: string; items: DocListEntry[] }> {
  const grouped: Grouped = {};
  const groupOrder: string[] = [];
  for (const d of docs) {
    if (!(d.group in grouped)) {
      grouped[d.group] = [];
      groupOrder.push(d.group);
    }
    grouped[d.group].push(d);
  }
  return groupOrder.map((g) => ({ group: g, items: grouped[g] }));
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatAge(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const delta = Math.max(0, now - then);
  const m = Math.floor(delta / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function DocsPage() {
  return (
    <Suspense
      fallback={
        <div className="docsDock">
          <aside className="docsSidebar">
            <p className="subtle">Loading…</p>
          </aside>
          <main className="docsContent">
            <p className="subtle">Loading…</p>
          </main>
        </div>
      }
    >
      <DocsPageInner />
    </Suspense>
  );
}

function DocsPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const activeSlug = search?.get('doc') ?? null;

  const [list, setList] = useState<DocListEntry[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocContent | null>(null);
  const [docErr, setDocErr] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load the list of docs on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    fetchDocsList()
      .then((r) => {
        if (!cancelled) {
          setList(r.docs);
          setListErr(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setListErr(e instanceof Error ? e.message : 'Failed to load docs list');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Default to the first doc when the list arrives and nothing is selected
  useEffect(() => {
    if (list && list.length > 0 && !activeSlug) {
      router.replace(`/docs?doc=${list[0].slug}`);
    }
  }, [list, activeSlug, router]);

  // Load the active doc whenever the slug changes
  useEffect(() => {
    if (!activeSlug) {
      setDoc(null);
      return;
    }
    let cancelled = false;
    setLoadingDoc(true);
    setDocErr(null);
    fetchDoc(activeSlug)
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setDocErr(e instanceof Error ? e.message : 'Failed to load doc');
          setDoc(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDoc(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSlug]);

  const handleSelect = useCallback(
    (slug: string) => {
      router.replace(`/docs?doc=${slug}`);
      setSidebarOpen(false); // close mobile sidebar after pick
      // Scroll content to top
      const content = document.querySelector('.docsContent');
      if (content) content.scrollTop = 0;
    },
    [router],
  );

  const grouped = useMemo(() => (list ? groupDocs(list) : []), [list]);

  return (
    <div className="docsDock">
      {/* Mobile toggle for sidebar */}
      <button
        type="button"
        className="docsSidebarToggle"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-expanded={sidebarOpen}
      >
        {sidebarOpen ? 'Close contents' : 'Contents'}
      </button>

      <aside className={sidebarOpen ? 'docsSidebar open' : 'docsSidebar'} aria-label="Docs table of contents">
        <div className="docsSidebarHeader">
          <h2 className="docsSidebarTitle">Docs</h2>
          <p className="docsSidebarHint subtle">
            Everything you need to deploy, operate, and integrate SCP.
          </p>
        </div>

        {loadingList && <p className="subtle docsSidebarLoading">Loading…</p>}
        {listErr && <p className="docsSidebarError">Error: {listErr}</p>}

        {grouped.map(({ group, items }) => (
          <div key={group} className="docsGroup">
            <div className="docsGroupLabel">{group}</div>
            <ul className="docsGroupList">
              {items.map((item) => {
                const active = item.slug === activeSlug;
                return (
                  <li key={item.slug}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item.slug)}
                      className={active ? 'docsGroupItem active' : 'docsGroupItem'}
                      title={`${formatBytes(item.size)} • updated ${formatAge(item.updatedAt)}`}
                    >
                      {item.title}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </aside>

      <main className="docsContent" aria-live="polite">
        {loadingDoc && !doc && <p className="subtle">Loading…</p>}
        {docErr && <p className="docsContentError">Error: {docErr}</p>}

        {!doc && !loadingDoc && !docErr && (
          <div className="docsEmpty">
            <h1>Docs</h1>
            <p className="subtle">
              Pick a document from the list to start reading.
            </p>
          </div>
        )}

        {doc && (
          <article className="docsArticle">
            <div className="docsArticleMeta subtle">
              <span>{doc.group}</span>
              <span>•</span>
              <span>updated {formatAge(doc.updatedAt)}</span>
              <span>•</span>
              <span>{formatBytes(doc.size)}</span>
            </div>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Open external links in a new tab. Internal anchors stay in-place.
                a: ({ href, children, ...props }) => {
                  const isExternal = href && /^https?:\/\//.test(href);
                  return (
                    <a
                      href={href}
                      {...props}
                      target={isExternal ? '_blank' : undefined}
                      rel={isExternal ? 'noreferrer noopener' : undefined}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {doc.content}
            </ReactMarkdown>
          </article>
        )}
      </main>
    </div>
  );
}
