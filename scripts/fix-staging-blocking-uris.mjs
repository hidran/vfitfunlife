#!/usr/bin/env node
/**
 * Points the staging Auth blocking triggers at the functions' Cloud Run (run.app) URLs.
 *
 * firebase-tools registers 2nd-gen blocking functions under their cloudfunctions.net URL, but
 * firebase-functions verifies the Identity Platform token's audience against "run.app", so every
 * sign-up/sign-in on staging failed with a 503 ("Error code: 47"). Runs as a functions
 * postdeploy hook; a no-op for any project other than vfit-app-staging.
 *
 * Usage: node scripts/fix-staging-blocking-uris.mjs [--project vfit-app-staging]
 */
import { execFileSync } from 'node:child_process';

const argIdx = process.argv.indexOf('--project');
const project = argIdx > -1 ? process.argv[argIdx + 1] : process.env.GCLOUD_PROJECT;
if (project !== 'vfit-app-staging') {
  console.log(`[fix-staging-blocking-uris] project ${project ?? '(unset)'}: nothing to do`);
  process.exit(0);
}

const gcloud = (args) => execFileSync('gcloud', args, { encoding: 'utf8' }).trim();
const runUrl = (service) =>
  gcloud(['run', 'services', 'describe', service, '--region', 'europe-west1', '--project', project, '--format=value(status.url)']);

const token = gcloud(['auth', 'print-access-token']);
const res = await fetch(
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config?updateMask=blockingFunctions.triggers`,
  {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'x-goog-user-project': project, 'content-type': 'application/json' },
    body: JSON.stringify({
      blockingFunctions: {
        triggers: {
          beforeCreate: { functionUri: runUrl('stagingbeforeusercreated') },
          beforeSignIn: { functionUri: runUrl('stagingbeforeusersignedin') },
        },
      },
    }),
  }
);
const body = await res.json();
if (!res.ok) {
  console.error('[fix-staging-blocking-uris] failed:', body.error?.message ?? res.status);
  process.exit(1);
}
console.log('[fix-staging-blocking-uris]', JSON.stringify(body.blockingFunctions.triggers));
