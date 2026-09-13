import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestPersistentStorage } from './persistentStorage';

/**
 * The whole point of this module is that it never throws and never blocks, on
 * browsers that do not have the API and in privacy modes where merely reading
 * `navigator.storage` is an error. A rejected promise here would reach an
 * unhandled rejection at startup, before anything has painted.
 */

const withStorage = (storage: unknown) => vi.stubGlobal('navigator', { storage });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requesting persistent storage', () => {
  it('does not ask again when the origin already has it', async () => {
    const persist = vi.fn();
    withStorage({ persisted: async () => true, persist });

    expect(await requestPersistentStorage()).toEqual({ state: 'GRANTED', alreadyHad: true });
    // A repeat request is what triggers a prompt on some engines.
    expect(persist).not.toHaveBeenCalled();
  });

  it('reports a grant it had to ask for', async () => {
    withStorage({ persisted: async () => false, persist: async () => true });

    expect(await requestPersistentStorage()).toEqual({ state: 'GRANTED', alreadyHad: false });
  });

  it('reports a refusal rather than pretending it worked', async () => {
    // Chrome refuses on low engagement. Saying "protected" here would be the
    // more expensive lie, because it is the one that stops somebody exporting.
    withStorage({ persisted: async () => false, persist: async () => false });

    expect(await requestPersistentStorage()).toEqual({ state: 'REFUSED' });
  });

  it('survives a browser without the API', async () => {
    withStorage(undefined);

    const outcome = await requestPersistentStorage();
    expect(outcome.state).toBe('UNAVAILABLE');
  });

  it('survives a privacy mode that throws instead of refusing', async () => {
    withStorage({
      persisted: async () => {
        throw new Error('The operation is insecure.');
      },
      persist: async () => true,
    });

    const outcome = await requestPersistentStorage();
    expect(outcome).toEqual({ state: 'UNAVAILABLE', reason: 'The operation is insecure.' });
  });

  it('never rejects, whatever the browser does', async () => {
    withStorage({
      get persisted() {
        throw new Error('reading navigator.storage is blocked');
      },
    });

    await expect(requestPersistentStorage()).resolves.toMatchObject({ state: 'UNAVAILABLE' });
  });
});
