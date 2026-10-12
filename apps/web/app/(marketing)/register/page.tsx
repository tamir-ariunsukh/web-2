import { redirect } from 'next/navigation';

import { AuthForm } from '../../../components/auth-form';
import { getSession, registerAction } from '../../../lib/auth';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create an account',
  robots: { index: false },
};

export default async function RegisterPage(): Promise<React.JSX.Element> {
  if (await getSession()) redirect('/');

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-4 py-16">
      <AuthForm mode="register" action={registerAction} />
    </main>
  );
}
