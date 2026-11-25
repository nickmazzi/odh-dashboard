import * as React from 'react';
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateVariant,
  Tooltip,
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';

type EmptyStateActionsProps = {
  onCreateCollection: () => void;
  onImportCollection: () => void;
  isImportDisabled?: boolean;
  importDisabledTooltip?: string;
};

type EvaluationsEmptyStateProps = EmptyStateActionsProps & {
  title: string;
  body: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  testIds: {
    root: string;
    body: string;
    primaryAction: string;
    createCollection: string;
    importCollection: string;
  };
};

const EvaluationsEmptyState: React.FC<EvaluationsEmptyStateProps> = ({
  title,
  body,
  primaryActionLabel,
  onPrimaryAction,
  onCreateCollection,
  onImportCollection,
  isImportDisabled = false,
  importDisabledTooltip,
  testIds,
}) => {
  const importButton = (
    <Button
      variant="link"
      isDisabled={isImportDisabled}
      onClick={onImportCollection}
      data-testid={testIds.importCollection}
    >
      Import collection
    </Button>
  );

  return (
    <EmptyState
      headingLevel="h2"
      icon={SearchIcon}
      titleText={title}
      variant={EmptyStateVariant.lg}
      data-testid={testIds.root}
    >
      <EmptyStateBody data-testid={testIds.body}>{body}</EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>
          <Button variant="primary" onClick={onPrimaryAction} data-testid={testIds.primaryAction}>
            {primaryActionLabel}
          </Button>
        </EmptyStateActions>
        <EmptyStateActions>
          <Button
            variant="link"
            onClick={onCreateCollection}
            data-testid={testIds.createCollection}
          >
            Create collection
          </Button>
          {isImportDisabled ? (
            <Tooltip content={importDisabledTooltip}>
              {/* Span wrapper: hover events do not fire on a disabled button;
                  tabIndex keeps the tooltip reachable by keyboard. */}
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focus proxy for the disabled button so keyboard users can reach the tooltip */}
              <span tabIndex={0}>{importButton}</span>
            </Tooltip>
          ) : (
            importButton
          )}
        </EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  );
};

export type EvalHubEmptyStateProps = EmptyStateActionsProps & {
  onViewGallery: () => void;
};

export const EvalHubEmptyState: React.FC<EvalHubEmptyStateProps> = ({
  onViewGallery,
  onCreateCollection,
  onImportCollection,
  isImportDisabled,
  importDisabledTooltip,
}) => (
  <EvaluationsEmptyState
    title="No evaluation runs"
    body="No evaluation runs exist in this project. To get started, run a curated evaluation from the Gallery tab."
    primaryActionLabel="View gallery"
    onPrimaryAction={onViewGallery}
    onCreateCollection={onCreateCollection}
    onImportCollection={onImportCollection}
    isImportDisabled={isImportDisabled}
    importDisabledTooltip={importDisabledTooltip}
    testIds={{
      root: 'eval-hub-empty-state',
      body: 'eval-hub-empty-state-body',
      primaryAction: 'view-gallery-button',
      createCollection: 'empty-state-create-collection-button',
      importCollection: 'empty-state-import-collection-button',
    }}
  />
);

export type EvalHubCollectionsEmptyStateProps = EmptyStateActionsProps & {
  onViewGallery: () => void;
};

export const EvalHubCollectionsEmptyState: React.FC<EvalHubCollectionsEmptyStateProps> = ({
  onViewGallery,
  onCreateCollection,
  onImportCollection,
  isImportDisabled,
  importDisabledTooltip,
}) => (
  <EvaluationsEmptyState
    title="No benchmark collections"
    body="Create a benchmark collection to group benchmarks and pass criteria, or start with a curated collection in the gallery."
    primaryActionLabel="View gallery"
    onPrimaryAction={onViewGallery}
    onCreateCollection={onCreateCollection}
    onImportCollection={onImportCollection}
    isImportDisabled={isImportDisabled}
    importDisabledTooltip={importDisabledTooltip}
    testIds={{
      root: 'eval-hub-collections-empty-state',
      body: 'eval-hub-collections-empty-state-body',
      primaryAction: 'collections-empty-state-primary-action',
      createCollection: 'collections-empty-state-create-button',
      importCollection: 'collections-empty-state-import-button',
    }}
  />
);
