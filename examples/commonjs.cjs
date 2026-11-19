// Run after `npm run build`: node examples/commonjs.cjs
const { applyMergePatch, applyPatch, getValue } = require('../dist/cjs/index.js');

const config = { server: { port: 8080, host: 'localhost' }, debug: true };

console.log(
  applyPatch(config, [
    { op: 'test', path: '/server/port', value: 8080 },
    { op: 'replace', path: '/server/port', value: 9090 },
  ]),
);
console.log(applyMergePatch(config, { debug: null, server: { host: '0.0.0.0' } }));
console.log(getValue(config, '/server/host'));
