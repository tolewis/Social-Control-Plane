
'use client';

import type { ComponentType } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconCheckSquare,
  IconGauge,
  IconPlug,
  IconQueue,
} from './icons';

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string; title?: string }>;
};

const nav: NavItem[] = [
  { label: 'Overview', href: '/', icon: IconGauge },
  { label: 'Queue', href: '/queue', icon: IconQueue },
  { label: 'Review', href: '/review', icon: IconCheckSquare },
  { label: 'Connections', href: '/connections', icon: IconPlug },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ variant }: { variant: 'sidebar' | 'mobile' }) {
  const pathname = usePathname() ?? '/';

  if (variant === 'mobile') {
    return (
      <nav className="mobileNav" aria-label="Primary">
        {nav.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? 'mobileNavItem active' : 'mobileNavItem'}
            >
              <Icon className="navIcon" />
              <span className="mobileNavLabel">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="sideNav" aria-label="Primary">
      {nav.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? 'sideNavItem active' : 'sideNavItem'}
          >
            <Icon className="navIcon" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
