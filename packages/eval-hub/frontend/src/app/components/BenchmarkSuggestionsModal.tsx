import * as React from 'react';
import { Button, Checkbox, Content, Label, LabelGroup } from '@patternfly/react-core';
import {
  Tearsheet,
  TearsheetBody,
  TearsheetFooter,
  TearsheetHeader,
} from '@patternfly/react-component-groups';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import {
  formatCategory,
  getBenchmarkTargetTypes,
  getCategoryColor,
  getMetricDisplayName,
} from '~/app/components/benchmarkUtils';
import type { BenchmarkSuggestion } from '~/app/utilities/benchmarkSuggestions';

import './BenchmarkTableRow.scss';

type BenchmarkSuggestionsModalProps = {
  suggestions: BenchmarkSuggestion[];
  onApply: (keys: string[]) => void;
  onClose: () => void;
};

const BenchmarkSuggestionsModal: React.FC<BenchmarkSuggestionsModalProps> = ({
  suggestions,
  onApply,
  onClose,
}) => {
  const [checkedKeys, setCheckedKeys] = React.useState<string[]>(() =>
    suggestions.map((suggestion) => suggestion.key),
  );

  React.useEffect(() => {
    setCheckedKeys(suggestions.map((suggestion) => suggestion.key));
  }, [suggestions]);

  const checkedKeySet = React.useMemo(() => new Set(checkedKeys), [checkedKeys]);

  const handleToggle = React.useCallback((key: string, isChecked: boolean) => {
    setCheckedKeys((currentKeys) =>
      isChecked
        ? [...new Set([...currentKeys, key])]
        : currentKeys.filter((currentKey) => currentKey !== key),
    );
  }, []);

  const handleApply = React.useCallback(() => {
    if (checkedKeys.length === 0) {
      return;
    }

    onApply(checkedKeys);
  }, [checkedKeys, onApply]);

  return (
    <Tearsheet
      isOpen
      onClose={onClose}
      aria-label="AI suggested benchmarks"
      data-testid="copy-suite-benchmark-suggestions-modal"
    >
      <TearsheetHeader
        title="AI suggested benchmarks"
        description="Benchmarks related to your current selection, based on their evaluation metadata. Review and uncheck any you do not want to add."
      />
      <TearsheetBody>
        {suggestions.length === 0 ? (
          <Content component="p" data-testid="benchmark-suggestions-empty">
            No related benchmarks found for your current selection.
          </Content>
        ) : (
          <Table aria-label="Suggested benchmarks" data-testid="benchmark-suggestions-table">
            <Thead>
              <Tr>
                <Th screenReaderText="Select benchmark" />
                <Th>Benchmark</Th>
                <Th>Category</Th>
                <Th>Evaluates</Th>
                <Th>Metrics</Th>
              </Tr>
            </Thead>
            <Tbody>
              {suggestions.map((suggestion) => {
                const { benchmark } = suggestion;
                const targetTypes = getBenchmarkTargetTypes(benchmark.providerAgent);
                return (
                  <Tr
                    key={suggestion.key}
                    className="evalhub-benchmark-table__row"
                    isClickable
                    isSelectable
                    isRowSelected={checkedKeySet.has(suggestion.key)}
                    onRowClick={(event) => {
                      const target = event?.target;
                      if (target instanceof Element && target.closest('button, input, label')) {
                        return;
                      }
                      handleToggle(suggestion.key, !checkedKeySet.has(suggestion.key));
                    }}
                  >
                    <Td>
                      <Checkbox
                        id={`benchmark-suggestion-checkbox-${benchmark.id}`}
                        data-testid={`benchmark-suggestion-checkbox-${benchmark.id}`}
                        isChecked={checkedKeySet.has(suggestion.key)}
                        onChange={(_event, isChecked) => handleToggle(suggestion.key, isChecked)}
                        aria-label={`Select ${benchmark.name}`}
                      />
                    </Td>
                    <Td dataLabel="Benchmark">
                      <Content component="p" className="evalhub-benchmark-table__benchmark-name">
                        {benchmark.name}
                      </Content>
                      <Content component="p" className="evalhub-benchmark-table__benchmark-id">
                        {benchmark.providerName}-{benchmark.id}
                      </Content>
                      {benchmark.description ? (
                        <Content
                          component="p"
                          className="evalhub-benchmark-table__description"
                          data-testid={`benchmark-suggestion-description-${benchmark.id}`}
                        >
                          {benchmark.description}
                        </Content>
                      ) : null}
                    </Td>
                    <Td dataLabel="Category">
                      {benchmark.category ? (
                        <Label color={getCategoryColor(benchmark.category)} isCompact>
                          {formatCategory(benchmark.category)}
                        </Label>
                      ) : null}
                    </Td>
                    <Td dataLabel="Evaluates">
                      <LabelGroup isCompact>
                        {targetTypes.map((targetType) => (
                          <Label key={targetType} isCompact>
                            {formatCategory(targetType)}
                          </Label>
                        ))}
                      </LabelGroup>
                    </Td>
                    <Td dataLabel="Metrics">
                      <LabelGroup isCompact numLabels={3}>
                        {(benchmark.metrics ?? []).map((metric) => (
                          <Label key={metric} isCompact variant="outline">
                            {getMetricDisplayName(metric)}
                          </Label>
                        ))}
                      </LabelGroup>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </TearsheetBody>
      <TearsheetFooter>
        <Button
          variant="primary"
          data-testid="benchmark-suggestions-submit"
          onClick={handleApply}
          isDisabled={checkedKeys.length === 0}
        >
          Add {checkedKeys.length} benchmark{checkedKeys.length === 1 ? '' : 's'}
        </Button>
        <Button variant="link" data-testid="benchmark-suggestions-cancel" onClick={onClose}>
          Cancel
        </Button>
      </TearsheetFooter>
    </Tearsheet>
  );
};

export default BenchmarkSuggestionsModal;
