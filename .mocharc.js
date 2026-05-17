// Set ts-node to use the test-specific tsconfig (adds mocha types)
process.env.TS_NODE_PROJECT = 'tsconfig.test.json';

module.exports = {
  require: ['ts-node/register'],
  spec: 'src/test/**/*.test.ts',
  timeout: 10000,
};
