'use client';

import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import { IconPlus } from './icons';
import { ComposePanel } from './ComposePanel';

function titleForPath(pathname: string) {
  if (pathname === '/') return 'Dashboard';
  if (pathname.startsWith('/compose')) return 'Compose';
  if (pathname.startsWith('/queue')) return 'Queue';
  if (pathname.startsWith('/review')) return 'Review';
  if (pathname.startsWith('/calendar')) return 'Calendar';
  if (pathname.startsWith('/connections')) return 'Connections';
  if (pathname.startsWith('/studio')) return 'Studio';
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'Console';
}

export function TopBar() {
  const pathname = usePathname() ?? '/';
  const title = useMemo(() => titleForPath(pathname), [pathname]);
  const [composeOpen, setComposeOpen] = useState(false);

  return (
    <>
      <header className="topBar" style={{ justifyContent: 'space-between' }}>
        <div className="topBarLeft">
          <div className="topBarTitleBlock">
            <div className="topBarTitle">{title}</div>
          </div>
        </div>
        <div className="topBarRight" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 13 }}
            title="New draft"
          >
            <IconPlus width={16} height={16} />
            <span className="desktopOnly">New</span>
          </button>
          <ThemeToggle />
        </div>
      </header>
      {composeOpen && <ComposePanel onClose={() => setComposeOpen(false)} />}
    </>
  );
}
