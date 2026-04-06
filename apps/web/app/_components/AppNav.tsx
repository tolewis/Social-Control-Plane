'use client';

import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconBolt,
  IconCheckSquare,
  IconGauge,
  IconPlug,
  IconQueue,
  IconPlus,
  IconCalendar,
  IconGear,
} from './icons';

/** Returns true when the on-screen keyboard is likely open (iOS/Android). */
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // visualViewport resize is the most reliable cross-platform signal
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;

    const threshold = 0.75; // if viewport shrinks below 75% of window height, keyboard is up
    function check() {
      if (!vv) return;
      setVisible(vv.height < window.innerHeight * threshold);
    }

    vv.addEventListener('resize', check);
    vv.addEventListener('scroll', check);
    return () => {
      vv.removeEventListener('resize', check);
      vv.removeEventListener('scroll', check);
    };
  }, []);

  return visible;
}

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string; title?: string }>;
};

const nav: NavItem[] = [
  { label: 'Overview', href: '/', icon: IconGauge },
  { label: 'Studio', href: '/studio', icon: IconBolt },
  { label: 'Compose', href: '/compose', icon: IconPlus },
  { label: 'Queue', href: '/queue', icon: IconQueue },
  { label: 'Review', href: '/review', icon: IconCheckSquare },
  { label: 'Calendar', href: '/calendar', icon: IconCalendar },
  { label: 'Connections', href: '/connections', icon: IconPlug },
  { label: 'Settings', href: '/settings', icon: IconGear },
];

const mobileNav: NavItem[] = [
  { label: 'Home', href: '/', icon: IconGauge },
  { label: 'Studio', href: '/studio', icon: IconBolt },
  { label: 'Queue', href: '/queue', icon: IconQueue },
  { label: 'Review', href: '/review', icon: IconCheckSquare },
  { label: 'Calendar', href: '/calendar', icon: IconCalendar },
  { label: 'Connect', href: '/connections', icon: IconPlug },
  { label: 'Settings', href: '/settings', icon: IconGear },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ variant }: { variant: 'sidebar' | 'mobile' }) {
  const pathname = usePathname() ?? '/';
  const keyboardOpen = useKeyboardVisible();

  if (variant === 'mobile') {
    if (keyboardOpen) return null; // hide nav when keyboard is up
    return (
      <nav className="mobileNav" aria-label="Primary">
        {mobileNav.map((item) => {
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
