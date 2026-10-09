import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names and resolves Tailwind conflicts so a caller's override wins
 * over a component's default, e.g. `cn('px-4', 'px-6')` yields `px-6`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
