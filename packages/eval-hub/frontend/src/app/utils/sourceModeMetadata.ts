import type { SourceMode } from '~/app/types';

export const DASHBOARD_SOURCE_MODE_KEY = 'odh_dashboard_source_mode';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const getStoredSourceMode = (
  custom: Record<string, unknown> | undefined,
): SourceMode | undefined => {
  const sourceMode = custom?.[DASHBOARD_SOURCE_MODE_KEY];
  if (sourceMode === 'model' || sourceMode === 'agent' || sourceMode === 'prerecorded') {
    return sourceMode;
  }

  return undefined;
};
