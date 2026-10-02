export function AppLoading() {
  return (
    <main className="loading">
      <span className="brand-mark">M</span>
      <p>Preparing your workspace…</p>
    </main>
  );
}

export function PageLoading() {
  return (
    <div className="page-loading" role="status">
      <span className="loading-ring" />
      <p>Loading workspace…</p>
    </div>
  );
}
