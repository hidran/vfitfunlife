// Test bootstrap for Firebase Functions tests.
// Individual tests initialize firebase-functions-test or rules-unit-testing as needed.
import { beforeAll } from 'vitest';

beforeAll(() => {
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-vfit-test';
});
