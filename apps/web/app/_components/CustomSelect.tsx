'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IconChevronDown } from './icons';

export type SelectOption = {
  value: string;
  label: string;
  /** Optional leading icon/element */
  icon?: ReactNode;
  /** Optional secondary text (right-aligned, muted) */
  meta?: string;
};

type Props = {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
};

export function CustomSelect({ options, value, onChange, placeholder = 'Select...', id, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const handleToggle = useCallback(() => {
    if (!disabled) setOpen((o) => !o);
  }, [disabled]);

  const handleSelect = useCallback((val: string) => {
    onChange(val);
    setOpen(false);
  }, [onChange]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`customSelect${open ? ' open' : ''}${disabled ? ' disabled' : ''}`} ref={ref}>
      <button
        type="button"
        id={id}
        className="customSelectTrigger"
        onClick={handleToggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
      >
        {selected ? (
          <span className="customSelectValue">
            {selected.icon && <span className="customSelectIcon">{selected.icon}</span>}
            <span className="customSelectLabel">{selected.label}</span>
            {selected.meta && <span className="customSelectMeta">{selected.meta}</span>}
          </span>
        ) : (
          <span className="customSelectPlaceholder">{placeholder}</span>
        )}
        <IconChevronDown
          width={14}
          height={14}
          className="customSelectChevron"
          style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms ease' }}
        />
      </button>

      {open && (
        <div className="customSelectDropdown" role="listbox">
          {options.length === 0 ? (
            <div className="customSelectEmpty">No options</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`customSelectOption${opt.value === value ? ' selected' : ''}`}
                onClick={() => handleSelect(opt.value)}
              >
                {opt.icon && <span className="customSelectIcon">{opt.icon}</span>}
                <span className="customSelectLabel">{opt.label}</span>
                {opt.meta && <span className="customSelectMeta">{opt.meta}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
