import { extractActions, quickSummary, splitSentences } from '../quick-summary';
import type { TranscriptSegment } from '@/engines/types';

const seg = (i: number, speaker: number, text: string, final = true): TranscriptSegment => ({
  id: `s${i}`,
  speaker,
  text,
  startMs: i * 1000,
  endMs: i * 1000 + 900,
  final,
});

const meeting = [
  seg(0, 0, 'Thanks everyone. The Q3 plan locks on Friday, so design starts on Monday.'),
  seg(1, 1, 'Budget is still the open question for the Q3 plan. I will draft the budget numbers by Friday.'),
  seg(2, 2, 'Timeline worries me more than the budget. Can you share the design brief on Monday?'),
  seg(3, 3, "I'll book the client review for next week."),
  seg(4, 0, 'This partial line should be ignored', false),
];

describe('splitSentences', () => {
  it('splits on sentence punctuation', () => {
    expect(splitSentences('One. Two? Three!')).toEqual(['One.', 'Two?', 'Three!']);
  });
});

describe('extractActions', () => {
  it('finds commitments with owner and due date', () => {
    const [a] = extractActions([{ text: 'I will draft the budget numbers by Friday.', speaker: 1 }]);
    expect(a).toMatchObject({ owner: 'Speaker 2', due: 'by Friday', possible: true });
  });
  it('finds requests without an owner', () => {
    const [a] = extractActions([{ text: 'Can you share the design brief on Monday?', speaker: 2 }]);
    expect(a).toMatchObject({ owner: null, due: 'on Monday' });
  });
  it('ignores plain statements', () => {
    expect(extractActions([{ text: 'The weather was nice.', speaker: 0 }])).toEqual([]);
  });
});

describe('quickSummary', () => {
  const s = quickSummary(meeting);
  it('returns at most three key points in time order', () => {
    expect(s.kind).toBe('quick');
    expect(s.keyPoints.length).toBeGreaterThan(0);
    expect(s.keyPoints.length).toBeLessThanOrEqual(3);
    const times = s.keyPoints.map((p) => p.atMs ?? 0);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
  it('skips partial segments', () => {
    expect(s.keyPoints.some((p) => p.text.includes('partial'))).toBe(false);
  });
  it('lists the three action items', () => {
    expect(s.actions.map((a) => a.due)).toEqual(['by Friday', 'on Monday', 'next week']);
  });
  it('handles an empty transcript', () => {
    expect(quickSummary([])).toEqual({ kind: 'quick', keyPoints: [], actions: [] });
  });
});
