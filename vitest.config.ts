import { defineConfig } from 'vitest/config';

/**
 * Service-level tests run in Node with fake-indexeddb standing in for the
 * browser's IndexedDB. `db/index.ts` already guards the Dexie Cloud addon
 * behind `typeof window !== 'undefined'`, so the sync layer stays out of the
 * way here and the schema, migrations and engines are exercised for real
 * rather than against mocks.
 */
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});
