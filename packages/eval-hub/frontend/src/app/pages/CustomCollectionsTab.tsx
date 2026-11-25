import * as React from 'react';
import { Content, Stack, StackItem } from '@patternfly/react-core';
import BenchmarkSuitesGallery from '~/app/components/BenchmarkSuitesGallery';
import type { BenchmarkNameMap } from '~/app/components/benchmarkUtils';
import type { Collection } from '~/app/types';

type CustomCollectionsTabProps = {
  namespace: string;
  benchmarkNameMap: BenchmarkNameMap;
  emptyState?: React.ReactNode;
  onSelectCollection: (collection: Collection) => void;
  onRunCollection: (collection: Collection) => void;
  onEditCollection: (collection: Collection) => void;
  onDuplicateCollection: (collection: Collection) => void;
};

const CustomCollectionsTab: React.FC<CustomCollectionsTabProps> = ({
  namespace,
  benchmarkNameMap,
  emptyState,
  onSelectCollection,
  onRunCollection,
  onEditCollection,
  onDuplicateCollection,
}) => (
  <Stack className="evalhub-evaluations-tab-content" data-testid="evaluate-tab-content">
    <StackItem>
      <Content
        component="p"
        className="evalhub-custom-collections-tab__description"
        data-testid="custom-collections-tab-description"
      >
        Create, import, and manage your own benchmark collections. Collections that you create,
        import, or run from the Gallery are saved here for easy access.
      </Content>
    </StackItem>
    <BenchmarkSuitesGallery
      namespace={namespace}
      benchmarkNameMap={benchmarkNameMap}
      showFilters
      showSort
      showPagination
      emptyState={emptyState}
      trackingSurface="my_benchmark_suites"
      primaryActionLabel="Run"
      onPrimaryAction={onRunCollection}
      onEditCollection={onEditCollection}
      onDuplicateCollection={onDuplicateCollection}
      onSelectCollection={onSelectCollection}
    />
  </Stack>
);

export default CustomCollectionsTab;
