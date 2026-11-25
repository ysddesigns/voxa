import { dark, light, rackDark, rackLight } from '../tokens';
import { sceneType, type } from '../type';

/**
 * Every screen lives in the same house as the Rack: the app palette is taken from the room's,
 * so moving between a list screen and the Library never changes the light.
 */
describe.each([
  ['day', light, rackLight],
  ['evening', dark, rackDark],
])('%s', (_name, p, r) => {
  it('the page is the room wall', () => {
    expect(p.background).toBe(r.wall);
  });
  it('text is the room ink', () => {
    expect(p.text).toBe(r.title);
    expect(p.textSecondary).toBe(r.overline);
  });
  it('the accent is the room accent', () => {
    expect(p.accent).toBe(r.accent);
  });
});

it('day cards are the paper of the shelf tags', () => {
  expect(light.card).toBe(rackLight.tagBg);
});

it('screen titles are set like the Library title', () => {
  expect(type.largeTitle).toEqual(sceneType.title);
});
