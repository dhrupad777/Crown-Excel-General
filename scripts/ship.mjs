#!/usr/bin/env node
// One-command deploy: build → push the live site (Firebase Hosting + Firestore rules) →
// save the code to GitHub. Run it with `npm run ship` (optionally `npm run ship -- "message"`).
// If the build or deploy fails, nothing is committed or pushed — fix the error and re-run.

import { execSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';

const PROJECT = 'crown-excel-general';
const SITE = 'https://crown-excel-general.web.app';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

const message =
  process.argv.slice(2).join(' ').trim() ||
  `Update ${new Date().toLocaleString('sv').slice(0, 16)}`; // e.g. "Update 2026-07-08 14:30"

try {
  console.log('\n▶  Building the app…');
  run('npm run build');

  console.log('\n▶  Deploying to the live site (hosting + security rules)…');
  run(`firebase deploy --only hosting,firestore:rules --project ${PROJECT}`);

  console.log('\n▶  Saving code to GitHub…');
  run('git add -A');
  if (out('git status --porcelain')) {
    // Pass the message via a file so any characters in it are safe (no shell escaping).
    writeFileSync('.git/SHIP_MSG', message);
    run('git commit -F .git/SHIP_MSG');
    rmSync('.git/SHIP_MSG');
    run('git push origin main');
    console.log(`\n✅  Live and pushed to GitHub — "${message}"`);
  } else {
    console.log('\n✅  Live. (No code changes to push to GitHub.)');
  }
  console.log(`    ${SITE}\n`);
} catch {
  console.error(
    '\n❌  Ship stopped at the step above. Nothing was pushed to GitHub if the build or deploy failed.\n' +
    '    Fix the reported error, then run `npm run ship` again.\n'
  );
  process.exit(1);
}
