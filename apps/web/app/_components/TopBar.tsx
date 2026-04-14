'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';
import {
  IconPlus,
  IconGauge,
  IconCheckSquare,
  IconChat,
  IconQueue,
  IconBolt,
  IconCalendar,
  IconGear,
  IconBook,
} from './icons';
import { ComposePanel } from './ComposePanel';

function titleForPath(pathname: string) {
  if (pathname === '/') return 'Dashboard';
  if (pathname.startsWith('/compose')) return 'Compose';
  if (pathname.startsWith('/queue')) return 'Queue';
  if (pathname.startsWith('/review')) return 'Review';
  if (pathname.startsWith('/engage')) return 'Engage';
  if (pathname.startsWith('/calendar')) return 'Calendar';
  if (pathname.startsWith('/connections')) return 'Connections';
  if (pathname.startsWith('/studio')) return 'Studio';
  if (pathname.startsWith('/docs')) return 'Docs';
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'Social Plane';
}

const menuItems = [
  { label: 'Dashboard', href: '/', icon: IconGauge },
  { label: 'Review', href: '/review', icon: IconCheckSquare },
  { label: 'Engage', href: '/engage', icon: IconChat },
  { label: 'Queue', href: '/queue', icon: IconQueue },
  { label: 'Studio', href: '/studio', icon: IconBolt },
  { label: 'Calendar', href: '/calendar', icon: IconCalendar },
  { label: 'Docs', href: '/docs', icon: IconBook },
  { label: 'Settings', href: '/settings', icon: IconGear },
];

export function TopBar() {
  const pathname = usePathname() ?? '/';
  const title = useMemo(() => titleForPath(pathname), [pathname]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [menuOpen]);

  return (
    <>
      <header className="topBar" style={{ justifyContent: 'space-between' }}>
        <div className="topBarLeft">
          {/* Hamburger — mobile only */}
          <div className="mobileMenuWrap" ref={menuRef}>
            <button
              type="button"
              className="hamburger"
              aria-label="Menu"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span /><span /><span />
            </button>
            {menuOpen && (
              <nav className="mobileDropdown" aria-label="Navigation">
                {menuItems.map(item => {
                  const Icon = item.icon;
                  const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`mobileDropdownItem ${active ? 'active' : ''}`}
                    >
                      <Icon width={18} height={18} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>
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
