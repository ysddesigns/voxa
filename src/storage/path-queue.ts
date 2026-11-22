/**
 * Runs file jobs one at a time per path. File writes are asynchronous, so two saves of the same
 * file (prefs changed twice quickly, captions appended back to back) would otherwise overlap and
 * both try to create the file. Jobs on different paths still run side by side.
 */
export function pathQueue() {
  const tails = new Map<string, Promise<unknown>>();
  return function run<T>(path: string, job: () => Promise<T>): Promise<T> {
    const prev = tails.get(path) ?? Promise.resolve();
    // Start after the previous job settles, whether it worked or not.
    const next = prev.then(job, job);
    const tail = next.catch(() => undefined);
    tails.set(path, tail);
    void tail.then(() => {
      if (tails.get(path) === tail) tails.delete(path);
    });
    return next;
  };
}
