/* eslint-disable camelcase */
import { useNavigate } from 'react-router-dom';
import { setupTrackingTest } from '~/__tests__/unit/testUtils/setupTrackingTest';
import { mockFlatBenchmark } from '~/__mocks__/mockBenchmark';
import { useRunBenchmark } from '~/app/hooks/useRunBenchmark';
import { EVAL_HUB_EVENTS } from '~/app/tracking/evalhubTrackingConstants';

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
}));

const mockUseNavigate = jest.mocked(useNavigate);
const mockNavigate = jest.fn();
const { mockTrackEvent, renderHook } = setupTrackingTest();

const benchmark = mockFlatBenchmark({ id: 'bench-alpha', providerId: 'test-provider' });

const renderRunBenchmark = () =>
  renderHook(({ ns }: { ns: string }) => useRunBenchmark(ns), { initialProps: { ns: 'test-ns' } });

describe('useRunBenchmark', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseNavigate.mockReset();
    mockUseNavigate.mockReturnValue(mockNavigate);
  });

  it('should navigate to the evaluation start form with the benchmark preselected', () => {
    const renderResult = renderRunBenchmark();
    renderResult.result.current(benchmark);

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/evaluation/test-ns/create/start?type=benchmark&providerId=test-provider&benchmarkId=bench-alpha',
      { state: { benchmark } },
    );
  });

  it('should track the single-benchmark run selection', () => {
    const renderResult = renderRunBenchmark();
    renderResult.result.current(benchmark);

    const runSelectedCall = mockTrackEvent.mock.calls.find(
      ([eventName]) => eventName === EVAL_HUB_EVENTS.BENCHMARK_RUN_SELECTED,
    );
    expect(runSelectedCall).toBeDefined();
    expect(runSelectedCall?.[1]).toEqual(
      expect.objectContaining({
        runType: 'single',
        benchmarkTypes: JSON.stringify(['bench-alpha']),
        countOfBenchmarks: 1,
        collection_type: 'system',
        provider_type: 'test-provider',
      }),
    );
  });

  it('should return a stable callback across rerenders', () => {
    const renderResult = renderRunBenchmark();

    renderResult.rerender({ ns: 'test-ns' });
    expect(renderResult).hookToBeStable();
  });
});
