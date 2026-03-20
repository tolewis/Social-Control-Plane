'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

function titleForPath(pathname: string) {
  if (pathname === '/') return 'Overview';
  if (pathname.startsWith('/compose')) return 'Compose';
  if (pathname.startsWith('/queue')) return 'Queue';
  if (pathname.startsWith('/review')) return 'Review';
  if (pathname.startsWith('/calendar')) return 'Calendar';
  if (pathname.startsWith('/connections')) return 'Connections';
  return 'Console';
}

export function TopBar() {
  const pathname = usePathname() ?? '/';
  const title = useMemo(() => titleForPath(pathname), [pathname]);

  return (
    <header className="topBar" style={{ justifyContent: 'space-between' }}>
      <div className="topBarLeft">
        <div className="topBarTitleBlock">
          <div className="topBarTitle">{title}</div>
          <div className="topBarMeta">
            <span className="dot" aria-hidden />
            <span>Local</span>
          </div>
        </div>
      </div>
      <div className="topBarRight">
        <ThemeToggle />
      </div>
    </header>
  );
}
