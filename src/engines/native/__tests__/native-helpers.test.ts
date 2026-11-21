import { deviceVoices, getNativeEngines, speakerId, tidyTranscript } from '../index';

describe('native engine helpers', () => {
  it('turns capitalised Zipformer output into a sentence', () => {
    expect(tidyTranscript('HELLO THERE I AM HERE')).toBe('Hello there I am here');
    expect(tidyTranscript("I'M SURE I'LL GO")).toBe("I'm sure I'll go");
    expect(tidyTranscript('')).toBe('');
  });

  it('keeps sentences the punctuation model already cased', () => {
    expect(tidyTranscript('The yellow lamps would light up here and there.')).toBe('The yellow lamps would light up here and there.');
    expect(tidyTranscript('Is Chinedu in Lagos, or Abuja?')).toBe('Is Chinedu in Lagos, or Abuja?');
  });

  it('maps voice ids to speaker ids, including ids saved by Kitten builds', () => {
    expect(speakerId('device-0')).toBe(0);
    expect(speakerId('device-3')).toBe(3);
    expect(speakerId('kitten-5')).toBe(5);
    expect(speakerId('lily')).toBe(0);
    expect(speakerId('kitten-x')).toBe(0);
  });

  it('lists one installed voice per speaker', () => {
    const v = deviceVoices(3);
    expect(v.map((x) => x.id)).toEqual(['device-0', 'device-1', 'device-2']);
    expect(v.every((x) => x.installed)).toBe(true);
    expect(deviceVoices(1).map((x) => x.name)).toEqual(['Standard']);
  });

  it('is unavailable when the native module is not in the build (Jest)', () => {
    expect(getNativeEngines()).toBeNull();
  });
});
