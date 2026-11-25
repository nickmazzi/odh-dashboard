import * as React from 'react';
import { Content, Stack, StackItem } from '@patternfly/react-core';
import BenchmarkCatalog from '~/app/components/BenchmarkCatalog';
import type { FlatBenchmark } from '~/app/types';

const DESCRIPTION = 'Select a benchmark to run on your model, agent, or dataset.';

type IndividualBenchmarksTabProps = {
  namespace: string;
  selectedBenchmark: FlatBenchmark | undefined;
  onSelectBenchmark: (benchmark: FlatBenchmark | undefined) => void;
};

const IndividualBenchmarksTab: React.FC<IndividualBenchmarksTabProps> = ({
  namespace,
  selectedBenchmark,
  onSelectBenchmark,
}) => (
  <Stack
    className="evalhub-evaluations-tab-content evalhub-individual-benchmarks-tab"
    data-testid="individual-benchmarks-tab-content"
  >
    <StackItem>
      <Content
        component="p"
        className="evalhub-individual-benchmarks-tab__description"
        data-testid="individual-benchmarks-description"
      >
        {DESCRIPTION}
      </Content>
    </StackItem>
    <StackItem className="evalhub-individual-benchmarks-tab__catalog" isFilled>
      <BenchmarkCatalog namespace={namespace} drawer={{ selectedBenchmark, onSelectBenchmark }} />
    </StackItem>
  </Stack>
);

export default IndividualBenchmarksTab;
