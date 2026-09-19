// Test bootstrap for Firebase Functions tests.
// Individual tests initialize firebase-functions-test or rules-unit-testing as needed.
import { beforeAll } from "vitest";
import * as admin from "firebase-admin";

beforeAll(() => {
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-vfit-test";
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  }
});
