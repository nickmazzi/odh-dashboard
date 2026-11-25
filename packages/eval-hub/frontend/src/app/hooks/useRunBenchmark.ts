import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import type { FlatBenchmark } from '~/app/types';
import { evaluationStartRoute } from '~/app/routes';
import { EVAL_HUB_EVENTS } from '~/app/tracking/evalhubTrackingConstants';
import { useEvalHubTracking } from '~/app/tracking/useEvalHubTracking';

/**
 * Navigates to the evaluation start form with a single benchmark preselected.
 * Shared by the benchmark catalog and the page-level benchmark drawer.
 */
export const useRunBenchmark = (namespace: string): ((benchmark: FlatBenchmark) => void) => {
  const { trackEvalHubEvent } = useEvalHubTracking();
  const navigate = useNavigate();

  return React.useCallback(
    (benchmark: FlatBenchmark) => {
      trackEvalHubEvent(
        EVAL_HUB_EVENTS.BENCHMARK_RUN_SELECTED,
        {
          runType: 'single',
          benchmarkTypes: JSON.stringify([benchmark.id]),
          countOfBenchmarks: 1,
        },
        {
          collectionType: 'system',
          providerType: benchmark.providerId,
        },
      );
      const params = new URLSearchParams({
        type: 'benchmark',
        providerId: benchmark.providerId,
        benchmarkId: benchmark.id,
      });
      navigate(`${evaluationStartRoute(namespace)}?${params.toString()}`, {
        state: { benchmark },
      });
    },
    [navigate, namespace, trackEvalHubEvent],
  );
};
