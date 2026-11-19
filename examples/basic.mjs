// Run after `npm run build`: node examples/basic.mjs
import { applyPatch, createMergePatch, diff, formatChanges, changes } from '../dist/esm/index.js';

const before = {
  version: '1.4.0',
  users: [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Linus' },
  ],
};
const after = {
  version: '1.5.0',
  users: [
    { id: 2, name: 'Linus' },
    { id: 1, name: 'Ada Lovelace' },
  ],
};

const patch = diff(before, after, { objectHash: 'id' });
console.log(JSON.stringify(patch, null, 2));
console.log(formatChanges(changes(before, after, { objectHash: 'id' })));

const result = applyPatch(before, patch);
console.log(JSON.stringify(result) === JSON.stringify(after) ? 'round trip ok' : 'round trip FAILED');

console.log(JSON.stringify(createMergePatch(before, after)));
