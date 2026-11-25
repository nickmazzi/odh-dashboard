import * as React from 'react';
import {
  Bullseye,
  Button,
  Content,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  EmptyState,
  EmptyStateBody,
  EmptyStateVariant,
  Flex,
  FlexItem,
  Gallery,
  MenuToggle,
  Pagination,
  SearchInput,
  Select,
  SelectList,
  SelectOption,
  Stack,
  StackItem,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarFilter,
  ToolbarGroup,
  ToolbarItem,
  ToolbarToggleGroup,
} from '@patternfly/react-core';
import { ExclamationCircleIcon, FilterIcon } from '@patternfly/react-icons';
import { useProviders } from '~/app/hooks/useProviders';
import useSearchInputTracking from '~/app/hooks/useSearchInputTracking';
import { useRunBenchmark } from '~/app/hooks/useRunBenchmark';
import { FlatBenchmark } from '~/app/types';
import {
  EVAL_HUB_EVENTS,
  type BenchmarkCatalogFilterType,
} from '~/app/tracking/evalhubTrackingConstants';
import { useEvalHubTracking } from '~/app/tracking/useEvalHubTracking';
import BenchmarkDrawerPanel from '~/app/components/BenchmarkDrawerPanel';
import BenchmarkCard from '~/app/components/BenchmarkCard';
import BenchmarkCardSkeleton from '~/app/components/BenchmarkCardSkeleton';
import { formatCategory, getMetricDisplayName } from '~/app/components/benchmarkUtils';
import SearchableMultiSelectFilter from '~/app/components/SearchableMultiSelectFilter';
import {
  filterBenchmarks,
  getAvailableCategories,
  getAvailableFrameworks,
  getAvailableMetrics,
  hasActiveBenchmarkFilters,
  isBenchmarkCatalogSortOption,
  sortBenchmarksByCatalogOption,
} from '~/app/utilities/benchmarkListFilters';
import {
  BenchmarkCatalogSortOption,
  BenchmarkFilterOptions,
  BenchmarkFilterDataType,
  benchmarkCatalogSortLabels,
  initialBenchmarkFilterData,
} from '~/app/pages/const';
import './BenchmarkCatalog.scss';

const PAGE_SIZES = [12, 24, 36];
const BENCHMARK_LOADING_CARD_COUNT = 6;

type BenchmarkCatalogDrawerProps = {
  selectedBenchmark: FlatBenchmark | undefined;
  onSelectBenchmark: (benchmark: FlatBenchmark | undefined) => void;
};

type BenchmarkCatalogProps = {
  namespace: string;
  /**
   * When provided, selection is controlled by the parent and the details
   * drawer is hosted by the parent page instead of inside the catalog.
   */
  drawer?: BenchmarkCatalogDrawerProps;
};

/**
 * Searchable catalog of individual benchmarks. Shared by the Select benchmark page and the
 * Individual benchmarks tab on the Evaluations page.
 */
const BenchmarkCatalog: React.FC<BenchmarkCatalogProps> = ({ namespace, drawer }) => {
  const { trackEvalHubEvent } = useEvalHubTracking();

  const { providers, loaded, loadError } = useProviders(namespace);
  const handleRunBenchmark = useRunBenchmark(namespace);

  const allBenchmarks = React.useMemo<FlatBenchmark[]>(
    () =>
      providers.flatMap((provider) =>
        (provider.benchmarks ?? []).map((b) => ({
          ...b,
          providerId: provider.resource.id,
          providerName: provider.title ?? provider.name,
          framework: provider.title ?? provider.name,
          providerAgent: provider.agent,
        })),
      ),
    [providers],
  );

  const [filterData, setFilterData] = React.useState<BenchmarkFilterDataType>(
    initialBenchmarkFilterData,
  );

  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(PAGE_SIZES[1]);

  const [internalSelectedBenchmark, setInternalSelectedBenchmark] = React.useState<
    FlatBenchmark | undefined
  >(undefined);
  const selectedBenchmark = drawer ? drawer.selectedBenchmark : internalSelectedBenchmark;
  const setSelectedBenchmark = drawer ? drawer.onSelectBenchmark : setInternalSelectedBenchmark;

  const [sortOption, setSortOption] = React.useState(BenchmarkCatalogSortOption.NAME_ASC);
  const [isSortOpen, setIsSortOpen] = React.useState(false);

  const availableCategories = React.useMemo(
    () => getAvailableCategories(allBenchmarks),
    [allBenchmarks],
  );

  const availableMetrics = React.useMemo(() => getAvailableMetrics(allBenchmarks), [allBenchmarks]);

  const availableFrameworks = React.useMemo(
    () => getAvailableFrameworks(allBenchmarks),
    [allBenchmarks],
  );

  const trackBenchmarkCatalogFilter = React.useCallback(
    (filterType: BenchmarkCatalogFilterType, selectedValues: string[]) => {
      const normalizedSelectedValues = [
        ...new Set(selectedValues.map((value) => value.trim()).filter(Boolean)),
      ].toSorted((first, second) =>
        first.localeCompare(second, undefined, { sensitivity: 'base' }),
      );

      if (normalizedSelectedValues.length === 0) {
        return;
      }

      trackEvalHubEvent(EVAL_HUB_EVENTS.BENCHMARK_CATALOG_FILTER_APPLIED, {
        filterType,
        value: normalizedSelectedValues.join(', '),
      });
    },
    [trackEvalHubEvent],
  );

  const handleSearchCommit = React.useCallback(
    (trimmedLength: number) => {
      trackBenchmarkCatalogFilter('search', [String(trimmedLength)]);
    },
    [trackBenchmarkCatalogFilter],
  );
  const searchInputTrackingProps = useSearchInputTracking(
    handleSearchCommit,
    filterData[BenchmarkFilterOptions.name],
  );

  const onClearFilters = React.useCallback(() => {
    setFilterData(initialBenchmarkFilterData);
    searchInputTrackingProps.reset();
  }, [searchInputTrackingProps]);

  const filteredBenchmarks = React.useMemo<FlatBenchmark[]>(
    () => filterBenchmarks(allBenchmarks, filterData),
    [allBenchmarks, filterData],
  );

  const sortedBenchmarks = React.useMemo<FlatBenchmark[]>(
    () => sortBenchmarksByCatalogOption(filteredBenchmarks, sortOption),
    [filteredBenchmarks, sortOption],
  );

  React.useEffect(() => {
    setPage(1);
  }, [filterData, sortOption, namespace]);

  const paginatedBenchmarks = React.useMemo<FlatBenchmark[]>(() => {
    const start = (page - 1) * perPage;
    return sortedBenchmarks.slice(start, start + perPage);
  }, [sortedBenchmarks, page, perPage]);

  const handleSelectBenchmark = (benchmark: FlatBenchmark) => {
    const isClosingSelectedBenchmark =
      selectedBenchmark?.id === benchmark.id &&
      selectedBenchmark.providerId === benchmark.providerId;

    if (!isClosingSelectedBenchmark) {
      trackEvalHubEvent(EVAL_HUB_EVENTS.BENCHMARK_DETAILS_VIEWED, {
        source: 'catalogTable',
      });
    }

    setSelectedBenchmark(isClosingSelectedBenchmark ? undefined : benchmark);
  };
  const hasActiveFilters = hasActiveBenchmarkFilters(filterData);

  const renderContent = () => {
    if (loadError) {
      return (
        <Bullseye className="evalhub-benchmark-catalog__state" data-testid="benchmarks-load-error">
          <EmptyState
            headingLevel="h2"
            icon={ExclamationCircleIcon}
            status="danger"
            titleText="Unable to load benchmarks"
            variant={EmptyStateVariant.lg}
          >
            <EmptyStateBody>
              {loadError.message || 'We could not load the benchmarks right now.'}
            </EmptyStateBody>
          </EmptyState>
        </Bullseye>
      );
    }

    if (!loaded) {
      return (
        <Gallery
          hasGutter
          minWidths={{ default: '280px' }}
          data-testid="benchmarks-loading"
          aria-label="Loading benchmarks"
          aria-busy="true"
        >
          {Array.from({ length: BENCHMARK_LOADING_CARD_COUNT }, (_, index) => (
            <BenchmarkCardSkeleton key={index} />
          ))}
        </Gallery>
      );
    }

    return (
      <Stack hasGutter className="evalhub-benchmark-catalog__stack">
        <StackItem>
          <Toolbar clearAllFilters={onClearFilters}>
            <ToolbarContent>
              <ToolbarToggleGroup breakpoint="md" toggleIcon={<FilterIcon />}>
                <ToolbarGroup variant="filter-group" data-testid="benchmarks-filter-toolbar">
                  <ToolbarFilter
                    labels={
                      filterData[BenchmarkFilterOptions.name]
                        ? [filterData[BenchmarkFilterOptions.name]]
                        : []
                    }
                    deleteLabel={() => {
                      setFilterData((prev) => ({
                        ...prev,
                        [BenchmarkFilterOptions.name]: '',
                      }));
                      searchInputTrackingProps.reset();
                    }}
                    categoryName="Name or ID"
                  >
                    <SearchInput
                      aria-label="Search benchmarks"
                      placeholder="Search benchmarks"
                      value={filterData[BenchmarkFilterOptions.name]}
                      onChange={(_event, value) => {
                        setFilterData((prev) => ({
                          ...prev,
                          [BenchmarkFilterOptions.name]: value,
                        }));
                      }}
                      inputProps={searchInputTrackingProps.inputProps}
                      onClear={() => {
                        setFilterData((prev) => ({
                          ...prev,
                          [BenchmarkFilterOptions.name]: '',
                        }));
                        searchInputTrackingProps.reset();
                      }}
                      data-testid="benchmarks-name-filter"
                    />
                  </ToolbarFilter>
                  <SearchableMultiSelectFilter
                    categoryName="Category"
                    emptyLabel="All categories"
                    options={availableCategories}
                    selected={filterData[BenchmarkFilterOptions.category]}
                    formatLabel={formatCategory}
                    onToggleOption={(value) => {
                      const selectedValues = filterData[BenchmarkFilterOptions.category];
                      const nextSelectedValues = selectedValues.includes(value)
                        ? selectedValues.filter((item) => item !== value)
                        : [...selectedValues, value];
                      setFilterData((prev) => ({
                        ...prev,
                        [BenchmarkFilterOptions.category]: nextSelectedValues,
                      }));
                      trackBenchmarkCatalogFilter('category', nextSelectedValues);
                    }}
                    onClearAll={() => {
                      setFilterData((prev) => ({
                        ...prev,
                        [BenchmarkFilterOptions.category]: [],
                      }));
                    }}
                    testIdPrefix="benchmarks-category"
                  />
                  <SearchableMultiSelectFilter
                    categoryName="Framework"
                    emptyLabel="All frameworks"
                    options={availableFrameworks}
                    selected={filterData[BenchmarkFilterOptions.framework]}
                    formatLabel={(value) => value}
                    onToggleOption={(value) => {
                      const selectedValues = filterData[BenchmarkFilterOptions.framework];
                      const nextSelectedValues = selectedValues.includes(value)
                        ? selectedValues.filter((item) => item !== value)
                        : [...selectedValues, value];
                      setFilterData((prev) => ({
                        ...prev,
                        [BenchmarkFilterOptions.framework]: nextSelectedValues,
                      }));
                      trackBenchmarkCatalogFilter('framework', nextSelectedValues);
                    }}
                    onClearAll={() => {
                      setFilterData((prev) => ({
                        ...prev,
                        [BenchmarkFilterOptions.framework]: [],
                      }));
                    }}
                    testIdPrefix="benchmarks-framework"
                  />
                  <SearchableMultiSelectFilter
                    categoryName="Metrics"
                    emptyLabel="All metrics"
                    options={availableMetrics}
                    selected={filterData[BenchmarkFilterOptions.metrics]}
                    formatLabel={getMetricDisplayName}
                    onToggleOption={(value) => {
                      const selectedValues = filterData[BenchmarkFilterOptions.metrics];
                      const nextSelectedValues = selectedValues.includes(value)
                        ? selectedValues.filter((item) => item !== value)
                        : [...selectedValues, value];
                      setFilterData((prev) => ({
                        ...prev,
                        [BenchmarkFilterOptions.metrics]: nextSelectedValues,
                      }));
                      trackBenchmarkCatalogFilter('metric', nextSelectedValues);
                    }}
                    onClearAll={() => {
                      setFilterData((prev) => ({
                        ...prev,
                        [BenchmarkFilterOptions.metrics]: [],
                      }));
                    }}
                    testIdPrefix="benchmarks-metrics"
                  />
                </ToolbarGroup>
              </ToolbarToggleGroup>
              <ToolbarItem>
                <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                  <FlexItem>
                    <Content component="p" className="pf-v6-u-mb-0">
                      Sort by
                    </Content>
                  </FlexItem>
                  <FlexItem>
                    <Select
                      isOpen={isSortOpen}
                      selected={sortOption}
                      onSelect={(_event, value) => {
                        if (isBenchmarkCatalogSortOption(value)) {
                          setSortOption(value);
                        }
                        setIsSortOpen(false);
                      }}
                      onOpenChange={setIsSortOpen}
                      toggle={(toggleRef) => (
                        <MenuToggle
                          ref={toggleRef}
                          onClick={() => setIsSortOpen((prev) => !prev)}
                          isExpanded={isSortOpen}
                          data-testid="benchmarks-sort-toggle"
                        >
                          {benchmarkCatalogSortLabels[sortOption]}
                        </MenuToggle>
                      )}
                      data-testid="benchmarks-sort-select"
                    >
                      <SelectList>
                        {Object.values(BenchmarkCatalogSortOption).map((opt) => (
                          <SelectOption
                            key={opt}
                            value={opt}
                            isSelected={sortOption === opt}
                            data-testid={`benchmarks-sort-option-${opt}`}
                          >
                            {benchmarkCatalogSortLabels[opt]}
                          </SelectOption>
                        ))}
                      </SelectList>
                    </Select>
                  </FlexItem>
                </Flex>
              </ToolbarItem>
              <ToolbarItem variant="pagination">
                <Pagination
                  itemCount={sortedBenchmarks.length}
                  page={page}
                  perPage={perPage}
                  onSetPage={(_evt, p) => setPage(p)}
                  onPerPageSelect={(_evt, pp) => {
                    setPerPage(pp);
                    setPage(1);
                  }}
                  perPageOptions={PAGE_SIZES.map((size) => ({
                    title: String(size),
                    value: size,
                  }))}
                  variant="top"
                  widgetId="benchmarks-pagination"
                  data-testid="benchmarks-pagination"
                  menuAppendTo="inline"
                  titles={{ paginationAriaLabel: 'top pagination' }}
                />
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>
        </StackItem>

        <StackItem isFilled>
          {paginatedBenchmarks.length === 0 ? (
            <Bullseye>
              <EmptyState variant={EmptyStateVariant.sm} data-testid="benchmarks-empty-state">
                <Title headingLevel="h2" size="lg">
                  No benchmarks found
                </Title>
                <EmptyStateBody>
                  {hasActiveFilters
                    ? 'No benchmarks match the filter criteria. Try adjusting or clearing your filters.'
                    : 'No benchmarks are currently available.'}
                </EmptyStateBody>
                {hasActiveFilters && (
                  <Button
                    variant="link"
                    onClick={onClearFilters}
                    data-testid="benchmarks-clear-filters"
                  >
                    Clear all filters
                  </Button>
                )}
              </EmptyState>
            </Bullseye>
          ) : (
            <Gallery hasGutter minWidths={{ default: '280px' }} data-testid="benchmarks-gallery">
              {paginatedBenchmarks.map((benchmark) => (
                <BenchmarkCard
                  key={`${benchmark.providerId}-${benchmark.id}`}
                  benchmark={benchmark}
                  isSelected={
                    selectedBenchmark?.id === benchmark.id &&
                    selectedBenchmark.providerId === benchmark.providerId
                  }
                  onSelect={() => handleSelectBenchmark(benchmark)}
                  onRunBenchmark={() => handleRunBenchmark(benchmark)}
                />
              ))}
            </Gallery>
          )}
        </StackItem>
        {paginatedBenchmarks.length > 0 && (
          <StackItem>
            <Pagination
              itemCount={sortedBenchmarks.length}
              page={page}
              perPage={perPage}
              onSetPage={(_evt, p) => setPage(p)}
              onPerPageSelect={(_evt, pp) => {
                setPerPage(pp);
                setPage(1);
              }}
              perPageOptions={PAGE_SIZES.map((size) => ({
                title: String(size),
                value: size,
              }))}
              variant="bottom"
              widgetId="benchmarks-pagination-bottom"
              menuAppendTo="inline"
              titles={{ paginationAriaLabel: 'bottom pagination' }}
            />
          </StackItem>
        )}
      </Stack>
    );
  };

  if (drawer) {
    return (
      <div className="evalhub-benchmark-catalog">
        <div className="evalhub-benchmark-catalog__body">{renderContent()}</div>
      </div>
    );
  }

  return (
    <Drawer isExpanded={!!selectedBenchmark} className="evalhub-benchmark-catalog">
      <DrawerContent
        panelContent={
          <BenchmarkDrawerPanel
            benchmark={selectedBenchmark}
            onClose={() => setSelectedBenchmark(undefined)}
            onRunBenchmark={handleRunBenchmark}
          />
        }
      >
        <DrawerContentBody className="evalhub-benchmark-catalog__body">
          {renderContent()}
        </DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
};

export default BenchmarkCatalog;
