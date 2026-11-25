import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  EvalHubCollectionsEmptyState,
  EvalHubEmptyState,
} from '~/app/components/EvalHubEmptyState';

const renderEmptyState = (props: Partial<React.ComponentProps<typeof EvalHubEmptyState>> = {}) => {
  const onViewGallery = jest.fn();
  const onCreateCollection = jest.fn();
  const onImportCollection = jest.fn();
  render(
    <EvalHubEmptyState
      onViewGallery={onViewGallery}
      onCreateCollection={onCreateCollection}
      onImportCollection={onImportCollection}
      {...props}
    />,
  );
  return { onViewGallery, onCreateCollection, onImportCollection };
};

describe('EvalHubEmptyState', () => {
  it('should render the empty state heading and latest copy', () => {
    renderEmptyState();
    expect(screen.getByTestId('eval-hub-empty-state')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No evaluation runs' })).toBeInTheDocument();
    expect(screen.getByTestId('eval-hub-empty-state-body')).toHaveTextContent(
      'No evaluation runs exist in this project. To get started, run a curated evaluation from the Gallery tab.',
    );
  });

  it('should call onViewGallery from the primary action', () => {
    const { onViewGallery } = renderEmptyState();
    const button = screen.getByTestId('view-gallery-button');
    expect(button).toHaveTextContent('View gallery');
    fireEvent.click(button);
    expect(onViewGallery).toHaveBeenCalledTimes(1);
  });

  it('should call onCreateCollection from the secondary link', () => {
    const { onCreateCollection } = renderEmptyState();
    const button = screen.getByTestId('empty-state-create-collection-button');
    expect(button).toHaveTextContent('Create collection');
    fireEvent.click(button);
    expect(onCreateCollection).toHaveBeenCalledTimes(1);
  });

  it('should call onImportCollection from the secondary link', () => {
    const { onImportCollection } = renderEmptyState();
    const button = screen.getByTestId('empty-state-import-collection-button');
    expect(button).toHaveTextContent('Import collection');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onImportCollection).toHaveBeenCalledTimes(1);
  });

  it('should disable import when the user cannot import collections', () => {
    renderEmptyState({ isImportDisabled: true, importDisabledTooltip: 'No permission' });
    expect(screen.getByTestId('empty-state-import-collection-button')).toBeDisabled();
  });
});

describe('EvalHubCollectionsEmptyState', () => {
  const renderCollectionsEmptyState = (
    props: Partial<React.ComponentProps<typeof EvalHubCollectionsEmptyState>> = {},
  ) => {
    const onViewGallery = jest.fn();
    const onCreateCollection = jest.fn();
    const onImportCollection = jest.fn();
    render(
      <EvalHubCollectionsEmptyState
        onViewGallery={onViewGallery}
        onCreateCollection={onCreateCollection}
        onImportCollection={onImportCollection}
        {...props}
      />,
    );
    return { onViewGallery, onCreateCollection, onImportCollection };
  };

  it('should render the latest collections empty state copy', () => {
    renderCollectionsEmptyState();
    expect(screen.getByTestId('eval-hub-collections-empty-state')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No benchmark collections' })).toBeInTheDocument();
    expect(screen.getByTestId('eval-hub-collections-empty-state-body')).toHaveTextContent(
      'Create a benchmark collection to group benchmarks and pass criteria, or start with a curated collection in the gallery.',
    );
  });

  it('should call onViewGallery from the primary action', () => {
    const { onViewGallery } = renderCollectionsEmptyState();
    const button = screen.getByTestId('collections-empty-state-primary-action');
    expect(button).toHaveTextContent('View gallery');
    fireEvent.click(button);
    expect(onViewGallery).toHaveBeenCalledTimes(1);
  });

  it('should call onCreateCollection and onImportCollection from the secondary links', () => {
    const { onCreateCollection, onImportCollection } = renderCollectionsEmptyState();
    fireEvent.click(screen.getByTestId('collections-empty-state-create-button'));
    expect(onCreateCollection).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('collections-empty-state-import-button'));
    expect(onImportCollection).toHaveBeenCalledTimes(1);
  });

  it('should disable import when the user cannot import collections', () => {
    renderCollectionsEmptyState({
      isImportDisabled: true,
      importDisabledTooltip: 'No permission',
    });
    expect(screen.getByTestId('collections-empty-state-import-button')).toBeDisabled();
  });
});
