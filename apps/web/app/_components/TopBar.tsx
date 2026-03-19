'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';

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
          </div>
        </div>
      </div>
    </header>
  );
}
