import { Skeleton } from '@repo/ui';

export default function SearchLoading(): React.JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-10">
      <Skeleton className="h-9 w-64" />
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-28 w-full" />
      ))}
    </main>
  );
}
