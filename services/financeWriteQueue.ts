// Bank commands and manual transactions share one queue: neither can overwrite
// the other's snapshot while an IndexedDB transaction is in flight.
let pending: Promise<unknown> = Promise.resolve();
export function financeWrite<T>(work: () => Promise<T>): Promise<T> {
  const job = pending.then(work);
  pending = job.catch(() => undefined);
  return job;
}
