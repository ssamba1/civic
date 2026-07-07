export const metadata = {
  title: "You're offline | Civic",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-xl font-semibold text-foreground">
        You&apos;re offline
      </h1>
      <p className="max-w-sm text-sm text-subtle">
        Civic needs a connection to load this page. Reconnect and try again —
        pages you&apos;ve already visited may still work from cache.
      </p>
    </div>
  );
}
