import { redirect } from 'next/navigation';

import { AuthForm } from '../../../components/auth-form';
import { getSession, loginAction } from '../../../lib/auth';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false },
};

export default async function LoginPage(): Promise<React.JSX.Element> {
  if (await getSession()) redirect('/');

  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-4 py-16">
      <AuthForm mode="login" action={loginAction} />
    </main>
  );
}
