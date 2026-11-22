import { Directory, File, Paths } from 'expo-file-system';
import type { Files } from './files';
import { pathQueue } from './path-queue';

const queue = pathQueue();

/** Voxa's folder in the app's private documents (not visible to other apps, kept across updates). */
const ROOT = 'voxa';

const parts = (path: string) => [ROOT, ...path.split('/').filter(Boolean)];

function fileAt(path: string) {
  return new File(Paths.document, ...parts(path));
}

function ensureParent(file: File) {
  const parent = file.parentDirectory;
  if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
}

export const deviceFiles: Files = {
  async read(path) {
    const f = fileAt(path);
    return f.exists ? f.text() : null;
  },
  write(path, text) {
    return queue(path, async () => {
      const f = fileAt(path);
      ensureParent(f);
      // Write a copy, then swap it in, so a crash mid-write never leaves half a file.
      // write() is asynchronous and creates the file itself: wait for it before the swap.
      const tmp = new File(f.parentDirectory, `${f.name}.tmp`);
      if (tmp.exists) tmp.delete();
      await tmp.write(text);
      if (f.exists) f.delete();
      tmp.rename(f.name);
    });
  },
  append(path, text) {
    return queue(path, async () => {
      const f = fileAt(path);
      ensureParent(f);
      await f.write(text, { append: true });
    });
  },
  async list(dir) {
    const d = new Directory(Paths.document, ...parts(dir));
    if (!d.exists) return [];
    return d
      .list()
      .map((item) => item.name)
      .sort();
  },
  async remove(path) {
    const f = fileAt(path);
    if (f.exists) {
      f.delete();
      return;
    }
    const d = new Directory(Paths.document, ...parts(path));
    if (d.exists) d.delete();
  },
};
