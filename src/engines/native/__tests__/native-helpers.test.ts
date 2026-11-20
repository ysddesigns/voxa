import { getNativeEngines, kittenVoices, speakerId, tidyTranscript } from '../index';

describe('native engine helpers', () => {
  it('turns capitalised Zipformer output into a sentence', () => {
    expect(tidyTranscript('HELLO THERE I AM HERE')).toBe('Hello there I am here');
    expect(tidyTranscript("I'M SURE I'LL GO")).toBe("I'm sure I'll go");
    expect(tidyTranscript('')).toBe('');
  });

  it('maps voice ids to Kitten speaker ids', () => {
    expect(speakerId('kitten-0')).toBe(0);
    expect(speakerId('kitten-5')).toBe(5);
    expect(speakerId('lily')).toBe(0);
    expect(speakerId('kitten-x')).toBe(0);
  });

  it('lists one installed voice per speaker', () => {
    const v = kittenVoices(3);
    expect(v.map((x) => x.id)).toEqual(['kitten-0', 'kitten-1', 'kitten-2']);
    expect(v.every((x) => x.installed)).toBe(true);
  });

  it('is unavailable when the native module is not in the build (Jest)', () => {
    expect(getNativeEngines()).toBeNull();
  });
});
