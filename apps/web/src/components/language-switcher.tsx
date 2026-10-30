'use client';

import { useState, useRef, useEffect } from 'react';
import { useLocale, localeLabels, supportedLocales, type Locale } from '@/i18n';

interface LanguageSwitcherProps {
  className?: string;
  theme?: 'light' | 'dark';
  compact?: boolean;
}

export function LanguageSwitcher({
  className = '',
  theme = 'light',
  compact = false,
}: LanguageSwitcherProps) {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLabel = localeLabels[locale] || localeLabels.fr;

  const buttonTheme =
    theme === 'dark'
      ? 'bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-850 hover:border-slate-700'
      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300';

  const menuTheme =
    theme === 'dark'
      ? 'bg-slate-900 border-slate-800 text-slate-200 shadow-2xl'
      : 'bg-white border-slate-200 text-slate-800 shadow-lg';

  const itemHover =
    theme === 'dark'
      ? 'hover:bg-slate-800 text-slate-300 hover:text-white'
      : 'hover:bg-slate-100 text-slate-700 hover:text-slate-900';

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Sélectionner la langue / Cambiar idioma / Select language"
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition shadow-sm ${buttonTheme}`}
      >
        <span className="text-base leading-none">{currentLabel.flag}</span>
        {!compact && <span>{currentLabel.label}</span>}
        <svg
          className={`h-3.5 w-3.5 opacity-60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute right-0 z-50 mt-1.5 w-36 origin-top-right rounded-xl border p-1 text-xs backdrop-blur-md focus:outline-none ${menuTheme}`}
        >
          {supportedLocales.map((loc) => {
            const item = localeLabels[loc];
            const isSelected = loc === locale;
            return (
              <button
                key={loc}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  setLocale(loc);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-medium transition ${
                  isSelected
                    ? theme === 'dark'
                      ? 'bg-brand-950/80 text-brand-300 font-semibold'
                      : 'bg-brand-50 text-brand-700 font-semibold'
                    : itemHover
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-base leading-none">{item.flag}</span>
                  <span>{item.label}</span>
                </span>
                {isSelected && (
                  <svg className="h-4 w-4 text-brand-600" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
