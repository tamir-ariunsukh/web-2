import { cn } from '../lib/cn';

import type { InputHTMLAttributes } from 'react';


export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Marks the field invalid for assistive technology and styling. */
  readonly invalid?: boolean;
}

export function Input({ className, invalid = false, ...rest }: InputProps): React.JSX.Element {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 transition',
        'placeholder:text-slate-400',
        'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
        'dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500',
        invalid
          ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
          : 'border-slate-300 dark:border-slate-700',
        className,
      )}
      {...rest}
    />
  );
}
