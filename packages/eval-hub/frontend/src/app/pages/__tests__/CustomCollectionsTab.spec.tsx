import * as React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { setupTrackingTest } from '~/__tests__/unit/testUtils/setupTrackingTest';
import { mockBenchmarkSuiteCollections } from '~/app/mockBenchmarkSuiteCollections';
import { mockProvider } from '~/__mocks__/mockProvider';
import CustomCollectionsTab from '~/app/pages/CustomCollectionsTab';

const { render } = setupTrackingTest();

const mockUseCollectionsQuery = jest.fn();
const mockUseProviders = jest.fn();

const mockOnSelectCollection = jest.fn();
const mockOnRunCollection = jest.fn();
const mockOnEditCollection = jest.fn();
const mockOnDuplicateCollection = jest.fn();

const clickFilterOption = (testId: string) => {
  fireEvent.click(within(screen.getByTestId(testId)).getByRole('checkbox'));
};

const getRenderedCollectionIds = () =>
  screen
    .getAllByTestId(/^benchmark-suite-card-name-/)
    .map((element) =>
      element.getAttribute('data-testid')?.replace('benchmark-suite-card-name-', ''),
    );

jest.mock('~/app/hooks/collections', () => ({
  useCollectionsQuery: (...args: unknown[]) => mockUseCollectionsQuery(...args),
  useDeleteCollectionMutation: () => ({
    error: null,
    isPending: false,
    mutateAsync: jest.fn(),
    reset: jest.fn(),
  }),
  useCanImportCollections: () => ({ data: true }),
  useImportCollectionMutation: () => ({
    isPending: false,
    reset: jest.fn(),
    mutate: jest.fn(),
  }),
}));

jest.mock('~/app/hooks/useProviders', () => ({
  useProviders: (...args: unknown[]) => mockUseProviders(...args),
}));

const renderTab = (props: Partial<React.ComponentProps<typeof CustomCollectionsTab>> = {}) =>
  render(
    <MemoryRouter>
      <CustomCollectionsTab
        namespace="test-project"
        benchmarkNameMap={new Map()}
        onSelectCollection={mockOnSelectCollection}
        onRunCollection={mockOnRunCollection}
        onEditCollection={mockOnEditCollection}
        onDuplicateCollection={mockOnDuplicateCollection}
        {...props}
      />
    </MemoryRouter>,
  );

const mockCollectionsResponse = (overrides: Record<string, unknown> = {}) => ({
  data: {
    items: mockBenchmarkSuiteCollections(),
    // eslint-disable-next-line camelcase
    total_count: 8,
  },
  isLoading: false,
  error: null,
  ...overrides,
});

describe('CustomCollectionsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProviders.mockReturnValue({ providers: [], loaded: true, loadError: undefined });
    mockUseCollectionsQuery.mockReturnValue(mockCollectionsResponse());
  });

  it('should render the full tenant collections gallery with filters and pagination', () => {
    renderTab();

    expect(screen.getByTestId('evaluate-tab-content')).toBeInTheDocument();
    expect(screen.getByTestId('custom-collections-tab-description')).toHaveTextContent(
      'Create, import, and manage your own benchmark collections. Collections that you create, import, or run from the Gallery are saved here for easy access.',
    );
    expect(screen.queryByTestId('create-suite-card')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View all' })).not.toBeInTheDocument();
    expect(screen.getByTestId('benchmark-suites-filter-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('benchmark-suites-pagination-top')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to first page' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to last page' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suites-pagination-bottom')).not.toBeInTheDocument();
    expect(screen.getByTestId('benchmark-suite-card-model-suite-2')).toBeInTheDocument();
    expect(screen.getByTestId('benchmark-suite-card-trace-evaluation-suite')).toBeInTheDocument();
    expect(
      screen.getByTestId('benchmark-suite-card-guardrails-compliance-suite'),
    ).toBeInTheDocument();
    expect(mockUseCollectionsQuery).toHaveBeenCalledWith(
      'test-project',
      'tenant',
      200,
      undefined,
      undefined,
      undefined,
    );
  });

  it('should run a collection through the page handler', async () => {
    renderTab();

    await userEvent.click(
      within(screen.getByTestId('benchmark-suite-card-model-suite-2')).getByRole('button', {
        name: 'Run',
      }),
    );

    expect(mockOnRunCollection).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Model suite 2' }),
    );
  });

  it('should keep suites visible while a filter refetch is pending', () => {
    // The query keeps the previous page visible (placeholderData) while the widened
    // filter query is in flight. A filter that matches nothing on the stale page must
    // not flash the empty state before the new results land.
    let isFetching = true;
    mockUseCollectionsQuery.mockImplementation(() => mockCollectionsResponse({ isFetching }));

    renderTab();

    fireEvent.change(screen.getByTestId('benchmark-suites-name-filter').querySelector('input')!, {
      target: { value: 'not-found' },
    });

    expect(screen.getByTestId('benchmark-suites-refresh-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suites-empty-state')).not.toBeInTheDocument();

    // Once the fetch settles with no matches, the empty state renders normally.
    isFetching = false;
    fireEvent.change(screen.getByTestId('benchmark-suites-name-filter').querySelector('input')!, {
      target: { value: 'still-not-found' },
    });

    expect(screen.getByTestId('benchmark-suites-empty-state')).toBeInTheDocument();
  });

  it('should clamp to the last valid page when the result count drops', async () => {
    // 9 suites => 2 pages of 8. Navigate to page 2, then shrink the result set to a
    // single page (as happens when the last suite on the last page is deleted) and
    // verify the gallery renders the last page instead of an out-of-range empty state.
    const nineCollections = [
      ...mockBenchmarkSuiteCollections(),
      {
        ...mockBenchmarkSuiteCollections()[0],
        name: 'Zulu extra suite',
        resource: { ...mockBenchmarkSuiteCollections()[0].resource, id: 'extra-suite' },
      },
    ];
    mockUseCollectionsQuery.mockReturnValue({
      // eslint-disable-next-line camelcase
      data: { items: nineCollections, total_count: nineCollections.length },
      isLoading: false,
      error: null,
    });

    const view = renderTab();
    const user = userEvent.setup();

    await user.click(
      within(screen.getByTestId('benchmark-suites-pagination-top')).getByRole('button', {
        name: 'Go to next page',
      }),
    );

    expect(screen.getByTestId('benchmark-suite-card-extra-suite')).toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suite-card-model-suite-2')).not.toBeInTheDocument();

    // The deletion lands: the count drops to a single page of suites. Re-render the same
    // tree so the page state survives and the clamp logic has to correct it.
    mockUseCollectionsQuery.mockReturnValue({
      data: {
        items: mockBenchmarkSuiteCollections(),
        // eslint-disable-next-line camelcase
        total_count: mockBenchmarkSuiteCollections().length,
      },
      isLoading: false,
      error: null,
    });

    view.rerender(
      <MemoryRouter>
        <CustomCollectionsTab
          namespace="test-project"
          benchmarkNameMap={new Map()}
          onSelectCollection={mockOnSelectCollection}
          onRunCollection={mockOnRunCollection}
          onEditCollection={mockOnEditCollection}
          onDuplicateCollection={mockOnDuplicateCollection}
        />
      </MemoryRouter>,
    );

    // The stale page-2 state is clamped back to the last valid page.
    expect(screen.getByTestId('benchmark-suite-card-model-suite-2')).toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suites-empty-state')).not.toBeInTheDocument();
  });

  it('should show a refresh spinner without hiding existing suites while fetching', () => {
    mockUseCollectionsQuery.mockReturnValue(mockCollectionsResponse({ isFetching: true }));

    renderTab();

    expect(screen.getByTestId('benchmark-suite-card-model-suite-2')).toBeInTheDocument();
    expect(screen.getByTestId('benchmark-suites-refresh-loading')).toBeInTheDocument();
  });

  it('should filter tenant benchmark suites by name', () => {
    renderTab();

    fireEvent.change(screen.getByTestId('benchmark-suites-name-filter').querySelector('input')!, {
      target: { value: 'code' },
    });

    expect(screen.getByTestId('benchmark-suite-card-code-quality-suite')).toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suite-card-model-suite-2')).not.toBeInTheDocument();
  });

  it('should search the capped fetched collection set when the name filter is used', () => {
    const collections = mockBenchmarkSuiteCollections();
    const firstPageCollections = collections.slice(0, 8);

    mockUseCollectionsQuery.mockImplementation((...args: unknown[]) => {
      const limit = args[2];
      const items = limit === 200 ? collections : firstPageCollections;

      return {
        // eslint-disable-next-line camelcase
        data: { items, total_count: collections.length },
        isLoading: false,
        error: null,
      };
    });

    renderTab();

    fireEvent.change(screen.getByTestId('benchmark-suites-name-filter').querySelector('input')!, {
      target: { value: 'finance' },
    });

    expect(screen.getByTestId('benchmark-suite-card-finance-evaluation-suite')).toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suite-card-model-suite-2')).not.toBeInTheDocument();
    expect(mockUseCollectionsQuery).toHaveBeenLastCalledWith(
      'test-project',
      'tenant',
      200,
      undefined,
      undefined,
      undefined,
    );
  });

  it('should render the provided empty state when there are no collections', () => {
    mockUseCollectionsQuery.mockReturnValue({
      data: {
        items: [],
        // eslint-disable-next-line camelcase
        total_count: 0,
      },
      isLoading: false,
      error: null,
    });

    renderTab({ emptyState: <div data-testid="custom-empty-state">Empty</div> });

    expect(screen.getByTestId('custom-empty-state')).toBeInTheDocument();
    expect(screen.queryByText('No collections are available.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suites-filter-toolbar')).not.toBeInTheDocument();
  });

  it('should show a search icon when no suites match the filters', () => {
    renderTab();

    fireEvent.change(screen.getByTestId('benchmark-suites-name-filter').querySelector('input')!, {
      target: { value: 'not-found' },
    });

    const emptyState = screen.getByTestId('benchmark-suites-empty-state');
    expect(emptyState).toBeInTheDocument();
    expect(emptyState.querySelector('svg')).toBeInTheDocument();
  });

  it('should hide filters when collections do not provide filter fields', () => {
    const collections = mockBenchmarkSuiteCollections().map((collection) => ({
      ...collection,
      category: undefined,
      domains: [],
      // eslint-disable-next-line camelcase
      evaluation_targets: [],
      tags: [],
      tasks: [],
      modalities: [],
      industries: [],
    }));

    mockUseCollectionsQuery.mockReturnValue({
      data: {
        items: collections,
        // eslint-disable-next-line camelcase
        total_count: collections.length,
      },
      isLoading: false,
      error: null,
    });

    renderTab();

    expect(screen.queryByTestId('benchmark-suites-category-filter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suites-evaluates-filter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suites-industry-filter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suites-tags-filter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suites-task-filter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suites-modality-filter')).not.toBeInTheDocument();
  });

  it('should keep filters enabled when an active filter returns no suites', () => {
    renderTab();

    fireEvent.click(screen.getByTestId('benchmark-suites-category-filter'));
    clickFilterOption('benchmark-suites-category-filter-option-code');
    fireEvent.click(screen.getByTestId('benchmark-suites-more-filters-toggle'));
    fireEvent.click(screen.getByTestId('benchmark-suites-industry-filter'));
    clickFilterOption('benchmark-suites-industry-filter-option-health');

    expect(screen.getByTestId('benchmark-suites-empty-state')).toHaveTextContent(
      'No collections match the current filters.',
    );
    expect(
      screen.getByTestId('benchmark-suites-name-filter').querySelector('input'),
    ).not.toBeDisabled();
    expect(screen.getByTestId('benchmark-suites-category-filter')).not.toBeDisabled();
    expect(screen.getByTestId('benchmark-suites-industry-filter')).not.toBeDisabled();
  });

  it('should derive filter options from collection fields', async () => {
    const collections = mockBenchmarkSuiteCollections().map((collection, index) => ({
      ...collection,
      category: 'legacy-category',
      domains: [index % 2 === 0 ? 'z-category' : 'a-category'],
      // eslint-disable-next-line camelcase
      evaluation_targets: [index % 2 === 0 ? 'z-entity' : 'a-entity'],
      industries: [index % 2 === 0 ? 'z-industry' : 'a-industry'],
    }));
    mockUseCollectionsQuery.mockReturnValue({
      data: {
        items: collections,
        // eslint-disable-next-line camelcase
        total_count: collections.length,
      },
      isLoading: false,
      error: null,
    });

    renderTab();
    const user = userEvent.setup();

    await user.click(screen.getByTestId('benchmark-suites-category-filter'));

    expect(
      screen.getByTestId('benchmark-suites-category-filter-option-a-category'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('benchmark-suites-category-filter-option-z-category'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('benchmark-suites-category-filter-option-legacy-category'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId('benchmark-suites-category-filter'));
    await user.click(screen.getByTestId('benchmark-suites-more-filters-toggle'));
    await user.click(screen.getByTestId('benchmark-suites-evaluates-filter'));

    expect(
      screen.getByTestId('benchmark-suites-evaluates-filter-option-a-entity'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('benchmark-suites-evaluates-filter-option-z-entity'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('benchmark-suites-evaluates-filter-option-model'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId('benchmark-suites-industry-filter'));

    expect(
      screen.getByTestId('benchmark-suites-industry-filter-option-a-industry'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('benchmark-suites-industry-filter-option-z-industry'),
    ).toBeInTheDocument();
  });

  it('should sort benchmark filter options by display name', async () => {
    const collections = [
      {
        ...mockBenchmarkSuiteCollections()[0],
        benchmarks: [
          // eslint-disable-next-line camelcase
          { id: 'benchmark-z', provider_id: 'benchmark-provider' },
          // eslint-disable-next-line camelcase
          { id: 'benchmark-a', provider_id: 'benchmark-provider' },
        ],
      },
    ];
    mockUseCollectionsQuery.mockReturnValue({
      // eslint-disable-next-line camelcase
      data: { items: collections, total_count: collections.length },
      isLoading: false,
      error: null,
    });
    mockUseProviders.mockReturnValue({
      providers: [
        mockProvider({
          id: 'benchmark-provider',
          benchmarks: [
            { id: 'benchmark-z', name: 'Zulu Benchmark' },
            { id: 'benchmark-a', name: 'Alpha Benchmark' },
          ],
        }),
      ],
      loaded: true,
      loadError: undefined,
    });

    renderTab();
    await userEvent.click(screen.getByTestId('benchmark-suites-benchmarks-filter'));

    const alphaOption = screen.getByTestId('benchmark-suites-benchmarks-filter-option-benchmark-a');
    const zuluOption = screen.getByTestId('benchmark-suites-benchmarks-filter-option-benchmark-z');
    expect(alphaOption.compareDocumentPosition(zuluOption)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('should filter tenant benchmark suites by category and evaluates type', () => {
    renderTab();

    fireEvent.click(screen.getByTestId('benchmark-suites-category-filter'));
    clickFilterOption('benchmark-suites-category-filter-option-code');

    expect(screen.getByTestId('benchmark-suite-card-code-quality-suite')).toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suite-card-model-suite-2')).not.toBeInTheDocument();
    expect(mockUseCollectionsQuery).toHaveBeenLastCalledWith(
      'test-project',
      'tenant',
      200,
      undefined,
      undefined,
      undefined,
    );

    clickFilterOption('benchmark-suites-category-filter-option-code');
    fireEvent.click(screen.getByTestId('benchmark-suites-category-filter'));
    fireEvent.click(screen.getByTestId('benchmark-suites-more-filters-toggle'));
    fireEvent.click(screen.getByTestId('benchmark-suites-evaluates-filter'));
    clickFilterOption('benchmark-suites-evaluates-filter-option-agent');

    expect(screen.getByTestId('benchmark-suite-card-agent-safety-suite')).toBeInTheDocument();
    expect(screen.queryByTestId('benchmark-suite-card-code-quality-suite')).not.toBeInTheDocument();
    expect(mockUseCollectionsQuery).toHaveBeenLastCalledWith(
      'test-project',
      'tenant',
      200,
      undefined,
      undefined,
      undefined,
    );
  });

  it('should default the sort menu to date created newest first', () => {
    renderTab();

    expect(screen.getByTestId('benchmark-suites-sort-toggle')).toHaveTextContent(
      'Date created (newest first)',
    );
    expect(mockUseCollectionsQuery).toHaveBeenCalledWith(
      'test-project',
      'tenant',
      200,
      undefined,
      undefined,
      undefined,
    );
  });

  it('should sort tenant benchmark suites by date created newest first by default', () => {
    const collections = mockBenchmarkSuiteCollections().map((collection, index) => ({
      ...collection,
      resource: {
        ...collection.resource,
        // Oldest first in the API response so the default sort has to reverse it.
        // eslint-disable-next-line camelcase
        created_at: `2026-01-0${index + 1}T00:00:00Z`,
      },
    }));
    mockUseCollectionsQuery.mockReturnValue({
      // eslint-disable-next-line camelcase
      data: { items: collections, total_count: collections.length },
      isLoading: false,
      error: null,
    });

    renderTab();

    expect(getRenderedCollectionIds()).toEqual([
      'open-llm-leaderboard-v2',
      'finance-evaluation-suite',
      'guardrails-compliance-suite',
      'trace-evaluation-suite',
      'code-quality-suite',
      'agent-safety-suite',
      'model-suite-7',
      'model-suite-2',
    ]);
  });

  it('should sort tenant benchmark suites by name ascending', async () => {
    renderTab();

    fireEvent.click(screen.getByTestId('benchmark-suites-sort-toggle'));
    fireEvent.click(
      within(screen.getByTestId('benchmark-suites-sort-option-name_asc')).getByRole('option'),
    );

    expect(screen.getByTestId('benchmark-suites-sort-toggle')).toHaveTextContent('Name (A–Z)');
    expect(getRenderedCollectionIds()).toEqual([
      'agent-safety-suite',
      'code-quality-suite',
      'finance-evaluation-suite',
      'guardrails-compliance-suite',
      'model-suite-2',
      'model-suite-7',
      'open-llm-leaderboard-v2',
      'trace-evaluation-suite',
    ]);
  });

  it('should sort tenant benchmark suites by name descending', async () => {
    renderTab();

    fireEvent.click(screen.getByTestId('benchmark-suites-sort-toggle'));
    fireEvent.click(
      within(screen.getByTestId('benchmark-suites-sort-option-name_desc')).getByRole('option'),
    );

    expect(screen.getByTestId('benchmark-suites-sort-toggle')).toHaveTextContent('Name (Z–A)');
    expect(getRenderedCollectionIds()).toEqual([
      'trace-evaluation-suite',
      'open-llm-leaderboard-v2',
      'model-suite-7',
      'model-suite-2',
      'guardrails-compliance-suite',
      'finance-evaluation-suite',
      'code-quality-suite',
      'agent-safety-suite',
    ]);
  });

  it('should select a collection through the page handler', async () => {
    renderTab();

    await userEvent.click(screen.getByTestId('benchmark-suite-card-name-model-suite-2'));

    expect(mockOnSelectCollection).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Model suite 2' }),
    );
  });
});
