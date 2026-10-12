'use client';

import { Button, Card, CardBody, Field, Input } from '@repo/ui';
import Link from 'next/link';
import { useActionState } from 'react';

import type { AuthActionState } from '../lib/auth';

export interface AuthFormProps {
  readonly mode: 'login' | 'register';
  readonly action: (
    previous: AuthActionState,
    formData: FormData,
  ) => Promise<AuthActionState>;
}

const COPY = {
  login: {
    title: 'Sign in',
    submit: 'Sign in',
    switchText: 'New here?',
    switchHref: '/register',
    switchLabel: 'Create an account',
  },
  register: {
    title: 'Create your account',
    submit: 'Create account',
    switchText: 'Already registered?',
    switchHref: '/login',
    switchLabel: 'Sign in',
  },
} as const;

/** Shared sign-in / sign-up form. Submits to a server action. */
export function AuthForm({ mode, action }: AuthFormProps): React.JSX.Element {
  const [state, formAction, pending] = useActionState(action, {});
  const copy = COPY[mode];

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>

        <form action={formAction} className="flex flex-col gap-4">
          {mode === 'register' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="firstName">
                <Input id="firstName" name="firstName" required autoComplete="given-name" placeholder="Bat" />
              </Field>
              <Field label="Last name" htmlFor="lastName">
                <Input id="lastName" name="lastName" required autoComplete="family-name" placeholder="Erdene" />
              </Field>
            </div>
          ) : null}

          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            hint={mode === 'register' ? 'At least 12 characters' : undefined}
          >
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={mode === 'register' ? 12 : undefined}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder="••••••••••••"
            />
          </Field>

          {mode === 'register' ? (
            <Field label="Phone" htmlFor="phone" hint="Optional">
              <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+976 9900 1122" />
            </Field>
          ) : null}

          {state.error ? (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
            >
              {state.error}
            </p>
          ) : null}

          <Button type="submit" loading={pending} className="self-start">
            {copy.submit}
          </Button>
        </form>

        <p className="text-sm text-slate-600 dark:text-slate-400">
          {copy.switchText}{' '}
          <Link href={copy.switchHref} className="text-brand-600 font-medium hover:underline">
            {copy.switchLabel}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
