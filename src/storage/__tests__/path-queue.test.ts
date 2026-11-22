import { pathQueue } from '../path-queue';

const tick = () => new Promise((r) => setTimeout(r, 1));

describe('pathQueue', () => {
  it('runs jobs on the same path one after another', async () => {
    const run = pathQueue();
    const log: string[] = [];
    const job = (name: string) => async () => {
      log.push(`${name} start`);
      await tick();
      log.push(`${name} end`);
    };
    await Promise.all([run('a', job('1')), run('a', job('2'))]);
    expect(log).toEqual(['1 start', '1 end', '2 start', '2 end']);
  });

  it('lets different paths overlap', async () => {
    const run = pathQueue();
    const log: string[] = [];
    const job = (name: string) => async () => {
      log.push(`${name} start`);
      await tick();
      log.push(`${name} end`);
    };
    await Promise.all([run('a', job('a')), run('b', job('b'))]);
    expect(log.slice(0, 2)).toEqual(['a start', 'b start']);
  });

  it('keeps going after a failed job and reports the failure to its caller', async () => {
    const run = pathQueue();
    const failed = run('a', async () => {
      throw new Error('disk full');
    });
    const next = run('a', async () => 'ok');
    await expect(failed).rejects.toThrow('disk full');
    await expect(next).resolves.toBe('ok');
  });
});
