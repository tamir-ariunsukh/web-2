import { cn } from '../lib/cn';

import type { HTMLAttributes, ReactNode } from 'react';


export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
}

export function Card({ className, children, ...rest }: CardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-card shadow-card border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: CardProps): React.JSX.Element {
  return (
    <div className={cn('border-b border-slate-200 px-6 py-4 dark:border-slate-800', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: CardProps): React.JSX.Element {
  return (
    <div className={cn('px-6 py-5', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: CardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'border-t border-slate-200 px-6 py-4 dark:border-slate-800',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
