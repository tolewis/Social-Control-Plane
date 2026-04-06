'use client';

import { useEffect, useState } from 'react';
import { IconPlus } from './icons';
import { ComposePanel } from './ComposePanel';

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
  const keyboardOpen = useKeyboardVisible();
  const [composeOpen, setComposeOpen] = useState(false);

  if (keyboardOpen) return null;

  return (
    <>
      <button
        type="button"
        className="fab"
        aria-label="New post"
        onClick={() => setComposeOpen(true)}
      >
        <IconPlus width={24} height={24} />
      </button>
      {composeOpen && <ComposePanel onClose={() => setComposeOpen(false)} />}
    </>
  );
}
