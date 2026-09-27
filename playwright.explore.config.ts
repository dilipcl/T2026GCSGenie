import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * For the journey tester's exploration, not for the gate.
 *
 * Exploratory specs are written to look, screenshot and report - they assert
 * little and are thrown away - so they live in `e2e/explore/`, which is
 * git-ignored and outside the main run. Same fixtures, same pinned clock,
 * same refusal to reach Dexie Cloud.
 */
export default defineConfig({
  ...base,
  testDir: './e2e/explore',
  // The base config ignores this folder; here it is the whole point.
  testIgnore: [],
  retries: 0,
  reporter: [['list']],
  use: { ...base.use, screenshot: 'on', trace: 'off' },
});
