export async function register() {
  // Scheduler reminder jalan di proses server Node, bukan di edge runtime.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scheduler');
    startScheduler();
  }
}
