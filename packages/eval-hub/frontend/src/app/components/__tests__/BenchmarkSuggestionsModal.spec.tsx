import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import BenchmarkSuggestionsModal from '~/app/components/BenchmarkSuggestionsModal';
import type { BenchmarkSuggestion } from '~/app/utilities/benchmarkSuggestions';
import type { FlatBenchmark } from '~/app/types';

const createSuggestion = (
  benchmark: Partial<FlatBenchmark>,
  score = 5,
  reasons: string[] = ['Task: reasoning'],
): BenchmarkSuggestion => ({
  benchmark: {
    id: 'benchmark',
    name: 'Benchmark',
    providerId: 'provider',
    providerName: 'Provider',
    category: 'reasoning',
    ...benchmark,
  },
  key: `${benchmark.providerId ?? 'provider'}:${benchmark.id ?? 'benchmark'}`,
  score,
  reasons,
});

const suggestions: BenchmarkSuggestion[] = [
  createSuggestion({ id: 'alpha', name: 'Alpha', providerId: 'provider-a' }),
  createSuggestion({ id: 'beta', name: 'Beta', providerId: 'provider-b' }),
];

type Props = React.ComponentProps<typeof BenchmarkSuggestionsModal>;

const renderModal = (overrides: Partial<Props> = {}) => {
  const onApply = jest.fn();
  const onClose = jest.fn();

  render(
    <BenchmarkSuggestionsModal
      suggestions={suggestions}
      onApply={onApply}
      onClose={onClose}
      {...overrides}
    />,
  );

  return { onApply, onClose };
};

describe('BenchmarkSuggestionsModal', () => {
  it('should render suggestions pre-checked', () => {
    renderModal();

    expect(screen.getByTestId('benchmark-suggestion-checkbox-alpha')).toBeChecked();
    expect(screen.getByTestId('benchmark-suggestion-checkbox-beta')).toBeChecked();
    expect(screen.getByText('Alpha')).toHaveClass('evalhub-benchmark-table__benchmark-name');
    expect(screen.queryByTestId('benchmark-suggestion-reasons-alpha')).not.toBeInTheDocument();
    expect(screen.getByTestId('benchmark-suggestions-submit')).toHaveTextContent(
      'Add 2 benchmarks',
    );
  });

  it('should render the benchmark description in the first cell', () => {
    renderModal({
      suggestions: [
        createSuggestion({
          id: 'described',
          name: 'Described benchmark',
          description: 'Evaluates factual knowledge across a curated question set.',
        }),
      ],
    });

    expect(screen.getByTestId('benchmark-suggestion-description-described')).toHaveTextContent(
      'Evaluates factual knowledge across a curated question set.',
    );
  });

  it('should apply only the still-checked benchmarks', () => {
    const { onApply, onClose } = renderModal();

    fireEvent.click(screen.getByTestId('benchmark-suggestion-checkbox-beta'));
    fireEvent.click(screen.getByTestId('benchmark-suggestions-submit'));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(['provider-a:alpha']);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('should disable submit when nothing is checked', () => {
    renderModal();

    fireEvent.click(screen.getByTestId('benchmark-suggestion-checkbox-alpha'));
    fireEvent.click(screen.getByTestId('benchmark-suggestion-checkbox-beta'));

    expect(screen.getByTestId('benchmark-suggestions-submit')).toBeDisabled();
  });

  it('should allow unchecking and rechecking within the limit', () => {
    renderModal();

    fireEvent.click(screen.getByTestId('benchmark-suggestion-checkbox-alpha'));
    expect(screen.getByTestId('benchmark-suggestion-checkbox-alpha')).not.toBeChecked();

    fireEvent.click(screen.getByTestId('benchmark-suggestion-checkbox-alpha'));
    expect(screen.getByTestId('benchmark-suggestion-checkbox-alpha')).toBeChecked();
  });

  it('should toggle a suggestion by clicking its row', () => {
    renderModal();

    const row = screen.getByTestId('benchmark-suggestion-checkbox-alpha').closest('tr');

    expect(row).toHaveClass('evalhub-benchmark-table__row', 'pf-m-selected');
    fireEvent.click(row as HTMLElement);
    expect(screen.getByTestId('benchmark-suggestion-checkbox-alpha')).not.toBeChecked();
    expect(row).not.toHaveClass('pf-m-selected');

    fireEvent.click(row as HTMLElement);
    expect(screen.getByTestId('benchmark-suggestion-checkbox-alpha')).toBeChecked();
    expect(row).toHaveClass('pf-m-selected');
  });

  it('should show an empty state when there are no suggestions', () => {
    renderModal({ suggestions: [] });

    expect(screen.getByTestId('benchmark-suggestions-empty')).toHaveTextContent(
      'No related benchmarks found for your current selection.',
    );
    expect(screen.getByTestId('benchmark-suggestions-submit')).toBeDisabled();
  });

  it('should close without applying on Cancel', () => {
    const { onApply, onClose } = renderModal();

    fireEvent.click(screen.getByTestId('benchmark-suggestions-cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});
