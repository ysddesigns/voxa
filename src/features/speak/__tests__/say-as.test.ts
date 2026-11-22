import { memoryFiles } from '@/storage/files';
import { parseSayAs, SayAsStore } from '../say-as';

describe('SayAsStore', () => {
  it('saves sounds by lower-case word, and removes them when emptied or the same as the word', async () => {
    const store = new SayAsStore(memoryFiles());
    expect(await store.set('Nnamdi', '  Nahm-dee ')).toEqual({ nnamdi: 'Nahm-dee' });
    expect(await store.set('NEPA', 'nee-pah')).toEqual({ nnamdi: 'Nahm-dee', nepa: 'nee-pah' });
    expect(await store.set('nnamdi', '')).toEqual({ nepa: 'nee-pah' });
    expect(await store.set('Ada', 'ada')).toEqual({ nepa: 'nee-pah' });
  });

  it('ignores a broken file', () => {
    expect(parseSayAs('{oops')).toEqual({});
    expect(parseSayAs('{"a": 3, "b": "bee"}')).toEqual({ b: 'bee' });
  });
});
