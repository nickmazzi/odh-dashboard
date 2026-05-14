import React from 'react';
import type { PlaygroundFeatureConfig } from '@odh-dashboard/plugin-core/types';

/**
 * Resolved feature config where all values are concrete booleans.
 * Standalone mode defaults all features to `true`; embedded mode defaults all to `false`.
 */
export type ResolvedPlaygroundFeatureConfig = Required<{
  [K in keyof PlaygroundFeatureConfig]: boolean;
}>;

/** Standalone default — every feature visible (no regression for the existing playground). */
export const STANDALONE_FEATURES: ResolvedPlaygroundFeatureConfig = {
  showModelPicker: true,
  showMcpServerConfig: true,
  showRagToggle: true,
  showCompareMode: true,
  showViewCodeModal: true,
  showNewChatModal: true,
  showSystemInstructions: true,
  showGuardrailConfig: true,
};

/** Embedded default — simplified chat-only UI with everything hidden. */
export const EMBEDDED_FEATURES: ResolvedPlaygroundFeatureConfig = {
  showModelPicker: false,
  showMcpServerConfig: false,
  showRagToggle: false,
  showCompareMode: false,
  showViewCodeModal: false,
  showNewChatModal: false,
  showSystemInstructions: false,
  showGuardrailConfig: false,
};

const PlaygroundFeaturesContext =
  React.createContext<ResolvedPlaygroundFeatureConfig>(STANDALONE_FEATURES);

export const usePlaygroundFeatures = (): ResolvedPlaygroundFeatureConfig =>
  React.useContext(PlaygroundFeaturesContext);

export default PlaygroundFeaturesContext;
