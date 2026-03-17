'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { IconAlertTriangle, IconBolt, IconSearch } from './icons';

function titleForPath(pathname: string) {
  if (pathname === '/') return 'Overview';
  if (pathname.startsWith('/queue')) return 'Queue';
  if (pathname.startsWith('/review')) return 'Review';
  if (pathname.startsWith('/connections')) return 'Connections';
  return 'Console';
}

export function TopBar() {
  const pathname = usePathname() ?? '/';
  const title = useMemo(() => titleForPath(pathname), [pathname]);

  return (
    <header className="topBar">
      <div className="topBarLeft">
        <div className="topBarTitleBlock">
          <div className="topBarTitle">{title}</div>
          <div className="topBarMeta">
            <span className="dot" aria-hidden />
            <span>Local</span>
            <span className="sep" aria-hidden>•</span>
            <span>Worker: idle</span>
          </div>
        </div>
      </div>

      <div className="topBarCenter" role="search">
        <IconSearch className="searchIcon" />
        <input
          className="searchInput"
          type="search"
          placeholder="Search queue, drafts, receipts…"
          aria-label="Search"
        />
        <div className="searchHint" aria-hidden>
          <span className="kbd">⌘</span>
          <span className="kbd">K</span>
        </div>
      </div>

      <div className="topBarRight">
        <Link className="btn ghost" href="/review">
          <IconAlertTriangle className="btnIcon" />
          Review
          <span className="pill neutral" style={{ marginLeft: 8 }}>3</span>
        </Link>
        <button className="btn primary" type="button">
          <IconBolt className="btnIcon" />
          Run queue
        </button>
      </div>
    </header>
  );
}
