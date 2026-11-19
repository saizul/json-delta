// Run after `npm run build`: node examples/optimistic-update.mjs
//
// Send only what changed to a server, guarded by `test` operations so the
// update fails cleanly if someone else edited the same fields meanwhile.
import { applyPatch, diff, JsonDeltaError } from '../dist/esm/index.js';

const serverCopy = { title: 'Draft', tags: ['news'], body: 'Hello' };
const edited = { title: 'Final', tags: ['news', 'release'], body: 'Hello' };

const patch = diff(serverCopy, edited, { invertible: true });
console.log('PATCH /posts/1', JSON.stringify(patch));

// Meanwhile a colleague renamed the post on the server...
const concurrent = { ...serverCopy, title: 'Draft v2' };
try {
  applyPatch(concurrent, patch);
} catch (err) {
  if (err instanceof JsonDeltaError && err.code === 'TEST_FAILED') {
    console.log(`409 Conflict: ${err.message}`);
  } else {
    throw err;
  }
}
