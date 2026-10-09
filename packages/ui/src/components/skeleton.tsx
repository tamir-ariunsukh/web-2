import { cn } from '../lib/cn';

export interface SkeletonProps {
  readonly className?: string;
}

/** Placeholder that reserves layout while data streams in. */
export function Skeleton({ className }: SkeletonProps): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800', className)}
    />
  );
}
