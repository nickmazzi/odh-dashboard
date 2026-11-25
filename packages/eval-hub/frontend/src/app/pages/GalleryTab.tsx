import * as React from 'react';
import { Content, Stack, StackItem } from '@patternfly/react-core';
import { useNavigate } from 'react-router-dom';
import BenchmarkSuitesGallery from '~/app/components/BenchmarkSuitesGallery';
import CuratedSuiteRunModal from '~/app/components/CuratedSuiteRunModal';
import { evaluationCopySuiteRoute, evaluationGalleryNavigationState } from '~/app/routes';
import type { BenchmarkNameMap } from '~/app/components/benchmarkUtils';
import type { Collection } from '~/app/types';
import { useEvalHubTracking } from '~/app/tracking/useEvalHubTracking';
import { EVAL_HUB_EVENTS } from '~/app/tracking/evalhubTrackingConstants';

type GalleryTabProps = {
  namespace: string;
  benchmarkNameMap: BenchmarkNameMap;
  onSelectCollection: (collection: Collection) => void;
  onRunSuccess: () => void;
};

const GalleryTab: React.FC<GalleryTabProps> = ({
  namespace,
  benchmarkNameMap,
  onSelectCollection,
  onRunSuccess,
}) => {
  const { trackEvalHubEvent } = useEvalHubTracking();

  const navigate = useNavigate();
  const [collectionToRun, setCollectionToRun] = React.useState<Collection | undefined>();

  const trackCustomizeCollection = React.useCallback(
    (collection: Collection) => {
      trackEvalHubEvent(
        EVAL_HUB_EVENTS.COLLECTION_CUSTOMIZE_CLICKED,
        {
          collectionName: collection.name,
          surface: 'curated_gallery',
        },
        {
          collectionType: collection.resource.read_only ? 'system' : 'custom',
          providerType: collection.benchmarks?.[0]?.provider_id,
        },
      );
    },
    [trackEvalHubEvent],
  );

  const handleCustomizeCollection = React.useCallback(
    (collection: Collection) => {
      trackCustomizeCollection(collection);
      navigate(evaluationCopySuiteRoute(namespace, collection.resource.id), {
        state: evaluationGalleryNavigationState,
      });
    },
    [navigate, namespace, trackCustomizeCollection],
  );

  const handleRunCollection = React.useCallback((collection: Collection) => {
    setCollectionToRun(collection);
  }, []);

  const handleRunSuccess = React.useCallback(() => {
    setCollectionToRun(undefined);
    onRunSuccess();
  }, [onRunSuccess]);

  return (
    <Stack
      className="evalhub-evaluations-tab-content evalhub-gallery-tab"
      data-testid="gallery-tab-content"
    >
      <StackItem>
        <Content
          component="p"
          className="evalhub-gallery-tab__description"
          data-testid="gallery-tab-description"
        >
          Browse and run benchmark collections curated by Red Hat. Collections that you run are
          saved to the Custom collections tab for easy access.
        </Content>
      </StackItem>
      <BenchmarkSuitesGallery
        namespace={namespace}
        benchmarkNameMap={benchmarkNameMap}
        scope="system"
        requireCuratedIndex
        useMockFallback
        showFilters
        // TEMP: Keep model-only behavior until EvalHub supports more evaluation_targets; restore this code when support is added.
        // showEvaluatesFilter
        showEvaluatesFilter={false}
        showPagination
        // TEMP: Show the full first-release gallery. Re-enable the controls once the gallery grows.
        showPaginationControls={false}
        showContextualActions={false}
        trackingSurface="collection_gallery"
        primaryActionLabel="Run"
        primaryActionVariant="secondary"
        dropdownActionLabel="Customize"
        dropdownActionRoute={(collection) =>
          evaluationCopySuiteRoute(namespace, collection.resource.id)
        }
        dropdownActionState={evaluationGalleryNavigationState}
        onPrimaryAction={handleRunCollection}
        onDropdownAction={trackCustomizeCollection}
        onDuplicateCollection={handleCustomizeCollection}
        onSelectCollection={onSelectCollection}
      />
      {collectionToRun ? (
        <CuratedSuiteRunModal
          isOpen
          onClose={() => setCollectionToRun(undefined)}
          namespace={namespace}
          collection={collectionToRun}
          trackingSource="curated_gallery"
          onSuccess={handleRunSuccess}
        />
      ) : null}
    </Stack>
  );
};

export default GalleryTab;
