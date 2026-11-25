import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import SearchableMultiSelectFilter from '~/app/components/SearchableMultiSelectFilter';

const renderFilter = (selected: string[]) =>
  render(
    <SearchableMultiSelectFilter
      categoryName="Metrics"
      emptyLabel="All metrics"
      options={['acc', 'acc_norm']}
      selected={selected}
      formatLabel={(value) => value}
      onToggleOption={jest.fn()}
      onClearAll={jest.fn()}
      testIdPrefix="benchmarks-metrics"
    />,
  );

describe('SearchableMultiSelectFilter', () => {
  it('should show the all-label when nothing is selected', () => {
    renderFilter([]);
    const toggle = screen.getByTestId('benchmarks-metrics-filter');
    expect(toggle).toHaveTextContent('All metrics');
    expect(within(toggle).queryByTestId('benchmarks-metrics-filter-badge')).not.toBeInTheDocument();
  });

  it('should keep the category label and count badge when selections exist', () => {
    renderFilter(['acc', 'acc_norm']);
    const toggle = screen.getByTestId('benchmarks-metrics-filter');
    expect(toggle).toHaveTextContent('Metrics');
    expect(toggle).not.toHaveTextContent('All metrics');
    expect(within(toggle).getByTestId('benchmarks-metrics-filter-badge')).toHaveTextContent('2');
  });
});
