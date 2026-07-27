import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/entity-resolver-core',
  'packages/entity-resolver-node',
  'packages/entity-resolver-browser',
  'packages/entity-resolver-server',
  'packages/entity-resolver-cli',
  'packages/entity-resolver-visual',
  'packages/entity-resolver',
]);
