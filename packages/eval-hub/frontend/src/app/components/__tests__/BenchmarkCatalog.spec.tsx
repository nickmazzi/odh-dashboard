import * as React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import BenchmarkCatalog from '~/app/components/BenchmarkCatalog';
import { mockBenchmark } from '~/__mocks__/mockBenchmark';
import { mockProvider } from '~/__mocks__/mockProvider';

let mockProvidersResult: {
  providers: ReturnType<typeof mockProvider>[];
  loaded: boolean;
  loadError: Error | undefined;
} = { providers: [], loaded: false, loadError: undefined };

jest.mock('~/app/hooks/useProviders', () => ({
  useProviders: () => mockProvidersResult,
}));

jest.mock('~/app/tracking/useEvalHubTracking', () => ({
  useEvalHubTracking: () => ({ trackEvalHubEvent: jest.fn() }),
}));

const renderCatalog = () =>
  render(
    <MemoryRouter>
      <BenchmarkCatalog namespace="test-ns" />
    </MemoryRouter>,
  );

describe('BenchmarkCatalog', () => {
  beforeEach(() => {
    mockProvidersResult = { providers: [], loaded: false, loadError: undefined };
  });

  it('should render benchmark card skeletons while providers are loading', () => {
    renderCatalog();

    expect(screen.getByTestId('benchmarks-loading')).toBeInTheDocument();
    expect(screen.getAllByTestId('benchmark-card-loading')).toHaveLength(6);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

describe('BenchmarkCatalog toolbar', () => {
  beforeEach(() => {
    mockProvidersResult = {
      providers: [
        mockProvider({
          id: 'test-provider',
          name: 'test-provider',
          title: 'Test Provider',
          benchmarks: [
            mockBenchmark({ id: 'bench-alpha', name: 'Alpha Bench' }),
            mockBenchmark({ id: 'bench-beta', name: 'Beta Bench' }),
          ],
        }),
      ],
      loaded: true,
      loadError: undefined,
    };
  });

  it('should render the design filter labels and sort control', async () => {
    renderCatalog();

    expect(screen.getByPlaceholderText('Search benchmarks')).toBeInTheDocument();
    expect(screen.getByTestId('benchmarks-category-filter')).toHaveTextContent('All categories');
    expect(screen.getByTestId('benchmarks-framework-filter')).toHaveTextContent('All frameworks');
    expect(screen.getByTestId('benchmarks-metrics-filter')).toHaveTextContent('All metrics');
    expect(screen.getByText('Sort by')).toBeInTheDocument();
    expect(screen.getByTestId('benchmarks-sort-toggle')).toHaveTextContent('Name (A–Z)');

    await userEvent.click(screen.getByTestId('benchmarks-sort-toggle'));
    expect(screen.getByTestId('benchmarks-sort-option-name_asc')).toHaveTextContent('Name (A–Z)');
    expect(screen.getByTestId('benchmarks-sort-option-name_desc')).toHaveTextContent('Name (Z–A)');
    expect(screen.getByTestId('benchmarks-sort-option-category_asc')).toHaveTextContent(
      'Category (A–Z)',
    );
    expect(screen.getByTestId('benchmarks-sort-option-category_desc')).toHaveTextContent(
      'Category (Z–A)',
    );
    expect(screen.queryByTestId('benchmarks-sort-option-default')).not.toBeInTheDocument();
  });

  it('should keep sort after the filters in the toolbar', () => {
    renderCatalog();

    const filters = screen.getByTestId('benchmarks-filter-toolbar');
    const sortToggle = screen.getByTestId('benchmarks-sort-toggle');
    expect(filters.compareDocumentPosition(sortToggle)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('should filter the visible benchmark cards by category', async () => {
    mockProvidersResult = {
      providers: [
        mockProvider({
          id: 'test-provider',
          name: 'test-provider',
          title: 'Test Provider',
          benchmarks: [
            mockBenchmark({ id: 'bench-alpha', name: 'Alpha Bench', category: 'Truthfulness' }),
            mockBenchmark({ id: 'bench-beta', name: 'Beta Bench', category: 'Reasoning' }),
          ],
        }),
      ],
      loaded: true,
      loadError: undefined,
    };
    renderCatalog();

    expect(screen.getByTestId('benchmark-card-test-provider-bench-alpha')).toBeInTheDocument();
    expect(screen.getByTestId('benchmark-card-test-provider-bench-beta')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('benchmarks-category-filter'));
    // PF only wires selection to the option's inner checkbox (label activation isn't forwarded in jsdom).
    const option = screen.getByTestId('benchmarks-category-filter-option-Reasoning');
    fireEvent.click(within(option).getByRole('checkbox'));

    expect(
      screen.queryByTestId('benchmark-card-test-provider-bench-alpha'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('benchmark-card-test-provider-bench-beta')).toBeInTheDocument();
  });

  it('should render a load error instead of the gallery when providers fail to load', () => {
    mockProvidersResult = {
      providers: [],
      loaded: true,
      loadError: new Error('Failed to load providers'),
    };
    renderCatalog();

    expect(screen.getByTestId('benchmarks-load-error')).toBeInTheDocument();
    expect(screen.queryByTestId('benchmarks-gallery')).not.toBeInTheDocument();
  });
});
