'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconPlus } from './icons';

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    function check() {
      if (!vv) return;
      setVisible(vv.height < window.innerHeight * 0.75);
    }
    vv.addEventListener('resize', check);
    return () => { vv.removeEventListener('resize', check); };
  }, []);
  return visible;
}

export function MobileFab() {
  const pathname = usePathname() ?? '/';
  const keyboardOpen = useKeyboardVisible();
  if (pathname === '/compose' || keyboardOpen) return null;
  return (
    <Link href="/compose" className="fab" aria-label="New post">
      <IconPlus width={24} height={24} />
    </Link>
  );
}
