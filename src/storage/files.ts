/**
 * The few file operations Voxa's storage needs, so stores can run on the phone (expo-file-system)
 * and in tests (memory). Paths are relative to Voxa's own folder, with "/" between parts.
 */
export interface Files {
  read(path: string): Promise<string | null>;
  write(path: string, text: string): Promise<void>;
  /** Adds to the end of the file (creating it): used so a crash loses at most the last line. */
  append(path: string, text: string): Promise<void>;
  /** Names directly inside a folder; empty when it does not exist. */
  list(dir: string): Promise<string[]>;
  remove(path: string): Promise<void>;
}

export function memoryFiles(initial: Record<string, string> = {}): Files & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async read(path) {
      return data.get(path) ?? null;
    },
    async write(path, text) {
      data.set(path, text);
    },
    async append(path, text) {
      data.set(path, (data.get(path) ?? '') + text);
    },
    async list(dir) {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`;
      const names = new Set<string>();
      for (const key of data.keys()) if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]);
      return [...names].sort();
    },
    async remove(path) {
      for (const key of [...data.keys()]) if (key === path || key.startsWith(`${path}/`)) data.delete(key);
    },
  };
}
