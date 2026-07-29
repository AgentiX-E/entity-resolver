// @agentix-e/entity-resolver-studio
// Interactive labeling and cluster review application.
//
// Dependencies: entity-resolver-core (algorithms) + entity-resolver-visual
// (Web Component base) + entity-resolver-browser (IndexedDB persistence).
//
// Can optionally bridge to entity-resolver-server for multi-user labeling.

export { createStudioSession, studioNextBatch, studioApply, studioReset } from './session.js';
export type { StudioSession, StudioPair, StudioBatch, FieldScore } from './session.js';

export { StudioPairReviewElement } from './components/pair-review.js';

export const studioVersion = '0.1.0';
