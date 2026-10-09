import { cn } from '../lib/cn';

import type { ReactNode } from 'react';


export interface FieldProps {
  readonly label: string;
  readonly htmlFor: string;
  readonly error?: string;
  readonly hint?: string;
  readonly required?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Label, control, hint and error as one accessible unit. The error is wired with
 * `role="alert"` so a screen reader announces it when validation fails.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  children,
  className,
}: FieldProps): React.JSX.Element {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-red-600 dark:text-red-400">
            {' *'}
          </span>
        ) : null}
      </label>

      {children}

      {hint && !error ? (
        <p id={hintId} className="text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
