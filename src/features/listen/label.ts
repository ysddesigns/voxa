import type { SpeechEngine, Summary, TranscriptSegment } from '@/engines/types';
import type { SessionStore } from '@/storage/sessions';
import { assignSpeakers } from './speakers';

/**
 * Finds who spoke when in a saved session's audio, labels its sentences, refreshes the summary
 * (action owners need speakers), then deletes the audio: it is only kept for this.
 */
export function labelSession(
  engine: SpeechEngine,
  store: SessionStore,
  id: string,
  summarize: (segments: TranscriptSegment[]) => Summary,
  onProgress?: (fraction: number) => void,
): { cancel(): void; done: Promise<number> } {
  if (!engine.labelSpeakers) return { cancel() {}, done: Promise.reject(new Error('Speaker labels need the on-device engine')) };
  const job = engine.labelSpeakers(store.audioPath(id), onProgress);
  const done = job.done.then(async (turns) => {
    const session = await store.load(id);
    if (!session) throw new Error('The session was deleted');
    const { bySegment, count } = assignSpeakers(session.segments, turns);
    await store.setSpeakers(id, bySegment, count);
    const labelled = session.segments.map((s) => (s.id in bySegment ? { ...s, speaker: bySegment[s.id] } : s));
    await store.updateMeta(id, { summary: summarize(labelled) });
    await store.removeAudio(id);
    return count;
  });
  return { cancel: job.cancel, done };
}
