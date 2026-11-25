import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Content,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  EmptyState,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateVariant,
  Flex,
  FlexItem,
  PageSection,
  Spinner,
  Stack,
  StackItem,
  Tab,
  Tabs,
  TabTitleText,
  Tooltip,
} from '@patternfly/react-core';
import { CogIcon } from '@patternfly/react-icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ProjectIconWithSize } from '@odh-dashboard/internal/concepts/projects/ProjectIconWithSize';
import { IconSize } from '@odh-dashboard/internal/types';
import { ApplicationsPage, WhosMyAdministrator } from '@odh-dashboard/ui-core';
import SupportIcon from '~/app/icons/SupportIcon';
import { evalHubEvaluationsRoute } from '~/app/utilities/routes';
import {
  getLatestEvaluationJob,
  getQueueNameByProfileName,
  mergeListEvaluationJobMetadata,
  resolveEvaluationJobQueues,
} from '~/app/utilities/evaluationUtils';
import {
  evaluationCopySuiteRoute,
  evaluationCreateSuiteRoute,
  evaluationEditSuiteRoute,
  evaluationEvaluateNavigationState,
  evaluationGalleryNavigationState,
  evaluationReconfigureRoute,
} from '~/app/routes';
import { useEvaluationJobs } from '~/app/hooks/useEvaluationJobs';
import useEvalHubHealth from '~/app/hooks/useEvalHubHealth';
import { useHardwareProfiles } from '~/app/hooks/useHardwareProfiles';
import { useCollectionNameMap } from '~/app/hooks/useCollectionNameMap';
import useUser from '~/app/hooks/useUser';
import EvalHubHeader from '~/app/components/EvalHubHeader';
import EvalHubProjectSelector from '~/app/components/EvalHubProjectSelector';
import {
  EvalHubCollectionsEmptyState,
  EvalHubEmptyState,
} from '~/app/components/EvalHubEmptyState';
import usePageVisibility from '~/app/hooks/usePageVisibility';
import EvaluationsTable from '~/app/components/EvaluationsTable';
import CollectionDrawerPanel from '~/app/components/CollectionDrawerPanel';
import BenchmarkDrawerPanel from '~/app/components/BenchmarkDrawerPanel';
import StartEvaluationRunModal from '~/app/components/StartEvaluationRunModal';
import CuratedSuiteRunModal from '~/app/components/CuratedSuiteRunModal';
import type { Collection, EvaluationJob, FlatBenchmark } from '~/app/types';
import { useCollectionDrawer } from '~/app/hooks/useCollectionDrawer';
import { useRunBenchmark } from '~/app/hooks/useRunBenchmark';
import StopEvaluationModal from '~/app/components/StopEvaluationModal';
import { useEvalHubTracking } from '~/app/tracking/useEvalHubTracking';
import {
  EVAL_HUB_EVENTS,
  type EvalHubCollectionSurface,
} from '~/app/tracking/evalhubTrackingConstants';
import { useCanImportCollections } from '~/app/hooks/collections';
import CustomCollectionsTab from './CustomCollectionsTab';
import GalleryTab from './GalleryTab';
import IndividualBenchmarksTab from './IndividualBenchmarksTab';

import './EvaluationsTabs.scss';

const EvaluationStatusModal = React.lazy(() => import('~/app/components/EvaluationStatusModal'));
// The import modal pulls in Monaco; load it only when the user opens Import.
const ImportCollectionModal = React.lazy(() => import('~/app/components/ImportCollectionModal'));

const GALLERY_TAB = 'gallery';
const EVALUATE_TAB = 'evaluate';
const INDIVIDUAL_BENCHMARKS_TAB = 'individual-benchmarks';
const RUNS_TAB = 'runs';
const TAB_KEYS = [GALLERY_TAB, EVALUATE_TAB, INDIVIDUAL_BENCHMARKS_TAB, RUNS_TAB];
const TAB_QUERY_PARAM = 'tab';
const EVALUATE_DESCRIPTION =
  'Evaluate models using curated benchmark collections. Start with a curated collection, customize it, or create your own. Add a collection to your project to use it in your evaluations.';
const RUNS_DESCRIPTION = 'Start and manage evaluation runs for models, agents, and datasets.';

const EvaluationsPage: React.FC = () => {
  const { trackEvalHubEvent } = useEvalHubTracking();

  const { namespace } = useParams<{ namespace: string }>();
  const { clusterAdmin } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get(TAB_QUERY_PARAM);
  const activeTab = TAB_KEYS.includes(tabParam ?? '') ? tabParam! : GALLERY_TAB;
  const isRunsTab = activeTab === RUNS_TAB;

  // Pause list polling when the browser tab is backgrounded
  const isPollingEnabled = usePageVisibility();

  const { isHealthy, loaded: healthLoaded, error: healthError } = useEvalHubHealth(namespace);

  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const canImportQuery = useCanImportCollections(namespace ?? '');
  // Import is enabled only on an explicit allowed result: it stays disabled
  // while the check is pending or has failed, so limited-access users are
  // never offered a creation flow the upstream authorization rejects.
  // isError also covers a failed refetch, where React Query keeps the last
  // (possibly allowed) result.
  const canImport = canImportQuery.data === true && !canImportQuery.isError;
  const importDisabledTooltip = canImportQuery.isPending
    ? 'Checking permission to create collections in this project...'
    : canImportQuery.isError
      ? 'Unable to verify permission to create collections in this project'
      : 'You do not have permission to create collections in this project';
  const isGalleryTab = activeTab === GALLERY_TAB;
  const headerSurface: EvalHubCollectionSurface = isGalleryTab
    ? 'collection_gallery'
    : 'my_benchmark_suites';
  // Never offer create/import entry points while the evaluation service is unavailable.
  const showHeaderActions = healthLoaded && isHealthy;

  const [evaluationsResult, loaded, error, refreshEvaluations] = useEvaluationJobs(
    { namespace },
    !isHealthy,
    isPollingEnabled,
  );
  const evaluations = evaluationsResult.jobs;
  // Queue-backed scheduling for profile-mode jobs is derived from /info, not guaranteed by
  // the job response contract. Never gate the runs list on this fetch — an unloaded or
  // failed /info just leaves profile-mode pending jobs showing as Pending. Shares the
  // ['evalHubInfo', namespace] query with the run form, so no extra request.
  const { profiles } = useHardwareProfiles(namespace);
  const queueNameByProfileName = React.useMemo(
    () => getQueueNameByProfileName(profiles),
    [profiles],
  );
  const enrichedEvaluations = React.useMemo(
    () => resolveEvaluationJobQueues(evaluations, queueNameByProfileName),
    [evaluations, queueNameByProfileName],
  );
  const { collectionNameMap, loaded: collectionsLoaded } = useCollectionNameMap();
  const [selectedJob, setSelectedJob] = React.useState<
    { job: EvaluationJob; namespace: string } | undefined
  >();
  const navigate = useNavigate();
  const [pendingStopJob, setPendingStopJob] = React.useState<EvaluationJob | undefined>();
  const {
    selectedCollection,
    benchmarkDetailsMap,
    benchmarkNameMap,
    selectCollection,
    closeDrawer,
  } = useCollectionDrawer(namespace ?? '');
  const [collectionToRun, setCollectionToRun] = React.useState<Collection | undefined>();
  const [curatedCollectionToRun, setCuratedCollectionToRun] = React.useState<
    Collection | undefined
  >();
  const [selectedCollectionIsSystem, setSelectedCollectionIsSystem] = React.useState(false);
  const [selectedBenchmark, setSelectedBenchmark] = React.useState<FlatBenchmark | undefined>();
  const [drawerKind, setDrawerKind] = React.useState<'collection' | 'benchmark'>('collection');
  const handleRunBenchmark = useRunBenchmark(namespace ?? '');
  const handleCloseDrawer = React.useCallback(() => {
    setSelectedCollectionIsSystem(false);
    setSelectedBenchmark(undefined);
    closeDrawer();
  }, [closeDrawer]);

  const handleSelectCollection = React.useCallback(
    (collection: Collection, isSystemCollection = false) => {
      setDrawerKind('collection');
      setSelectedBenchmark(undefined);
      setSelectedCollectionIsSystem(isSystemCollection);
      return selectCollection(collection);
    },
    [selectCollection],
  );

  const handleSelectBenchmark = React.useCallback(
    (benchmark: FlatBenchmark | undefined) => {
      if (benchmark) {
        setDrawerKind('benchmark');
        setSelectedCollectionIsSystem(false);
        closeDrawer();
      }
      setSelectedBenchmark(benchmark);
    },
    [closeDrawer],
  );

  const handleRunCollection = React.useCallback((collection: Collection) => {
    setCollectionToRun(collection);
  }, []);

  const handleRunSystemCollection = React.useCallback(
    (collection: Collection) => {
      handleCloseDrawer();
      setCuratedCollectionToRun(collection);
    },
    [handleCloseDrawer],
  );

  const handleDrawerRunCollection = React.useCallback(
    (collection: Collection, isSystemCollection: boolean) => {
      if (isSystemCollection) {
        handleRunSystemCollection(collection);
      } else {
        handleRunCollection(collection);
      }
    },
    [handleRunCollection, handleRunSystemCollection],
  );

  const handleDuplicateCollection = React.useCallback(
    (collection: Collection) => {
      trackEvalHubEvent(
        EVAL_HUB_EVENTS.COLLECTION_CUSTOMIZE_CLICKED,
        {
          collectionName: collection.name,
          surface: selectedCollectionIsSystem ? 'curated_gallery' : 'my_benchmark_suites',
        },
        {
          collectionType: collection.resource.read_only ? 'system' : 'custom',
          providerType: collection.benchmarks?.[0]?.provider_id,
        },
      );
      const route = evaluationCopySuiteRoute(namespace, collection.resource.id);
      if (selectedCollectionIsSystem) {
        navigate(route, { state: evaluationGalleryNavigationState });
      } else {
        navigate(route, { state: evaluationEvaluateNavigationState });
      }
    },
    [trackEvalHubEvent, navigate, namespace, selectedCollectionIsSystem],
  );

  const handleEvaluateDuplicateCollection = React.useCallback(
    (collection: Collection) => {
      trackEvalHubEvent(
        EVAL_HUB_EVENTS.COLLECTION_CUSTOMIZE_CLICKED,
        {
          collectionName: collection.name,
          surface: 'my_benchmark_suites',
        },
        {
          collectionType: collection.resource.read_only ? 'system' : 'custom',
          providerType: collection.benchmarks?.[0]?.provider_id,
        },
      );
      navigate(evaluationCopySuiteRoute(namespace, collection.resource.id), {
        state: evaluationEvaluateNavigationState,
      });
    },
    [trackEvalHubEvent, navigate, namespace],
  );

  const handleEditCollection = React.useCallback(
    (collection: Collection) => {
      trackEvalHubEvent(
        EVAL_HUB_EVENTS.COLLECTION_EDIT_OPENED,
        {
          collectionName: collection.name,
          surface: 'my_benchmark_suites',
        },
        {
          collectionType: collection.resource.read_only ? 'system' : 'custom',
          providerType: collection.benchmarks?.[0]?.provider_id,
        },
      );
      navigate(evaluationEditSuiteRoute(namespace, collection.resource.id), {
        state: evaluationEvaluateNavigationState,
      });
    },
    [trackEvalHubEvent, navigate, namespace],
  );

  const handleCreateCollection = React.useCallback(() => {
    trackEvalHubEvent(EVAL_HUB_EVENTS.COLLECTION_CREATE_OPENED, { surface: headerSurface });
    navigate(evaluationCreateSuiteRoute(namespace), {
      state: isGalleryTab ? evaluationGalleryNavigationState : evaluationEvaluateNavigationState,
    });
  }, [trackEvalHubEvent, navigate, namespace, headerSurface, isGalleryTab]);

  // Preserve the benchmark catalog signal that the removed Explore entry point emitted.
  React.useEffect(() => {
    if (activeTab === INDIVIDUAL_BENCHMARKS_TAB) {
      trackEvalHubEvent(EVAL_HUB_EVENTS.BENCHMARK_CATALOG_OPENED, {
        surface: 'my_benchmark_suites',
      });
    }
  }, [activeTab, trackEvalHubEvent]);

  const handleViewGallery = React.useCallback(() => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set(TAB_QUERY_PARAM, GALLERY_TAB);
    setSearchParams(nextSearchParams);
  }, [searchParams, setSearchParams]);

  const handleRunSuccess = React.useCallback(async () => {
    setCollectionToRun(undefined);
    setCuratedCollectionToRun(undefined);
    // Wait for the post-create list request before switching tabs so the Runs tab renders the
    // refreshed result instead of the list that was loaded before the evaluation was created.
    await refreshEvaluations();
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set(TAB_QUERY_PARAM, RUNS_TAB);
    setSearchParams(nextSearchParams);
  }, [refreshEvaluations, searchParams, setSearchParams]);

  const polledJobData = React.useMemo(() => {
    if (!selectedJob) {
      return undefined;
    }
    // Pick the latest lifecycle snapshot from the raw list — queue enrichment is metadata-only
    // and does not advance updated_at, so comparing against enriched jobs would discard the
    // queue an already-open modal should pick up when /info resolves.
    const listJob = evaluations.find((e) => e.resource.id === selectedJob.job.resource.id);
    const latestJob = getLatestEvaluationJob(selectedJob.job, listJob);
    // The selected snapshot may come from detail polling, which can omit hardware_config
    // metadata the list response carries. Recover the profile name and any explicit queue
    // from the raw list job regardless of updated_at — an explicit server queue assignment
    // must survive, and a queue is only inferred from /info after both snapshots are checked.
    const jobForResolution = mergeListEvaluationJobMetadata(latestJob, listJob);
    return resolveEvaluationJobQueues([jobForResolution], queueNameByProfileName)[0];
  }, [evaluations, queueNameByProfileName, selectedJob]);

  const onShowStatus = React.useCallback(
    (job: EvaluationJob) => {
      // Table rows bake the enriched list queue into the job they pass here, and that queue
      // may be display-only metadata derived from /info. The modal must only retain
      // explicitly server-assigned queues: when the raw list job has none, drop the baked
      // queue — polledJobData re-derives it from /info on every refresh so it tracks tenant
      // profile mapping changes instead of being frozen into the selected snapshot.
      const listJob = evaluations.find((e) => e.resource.id === job.resource.id);
      const modalJob =
        listJob && !listJob.hardware_config?.queue?.name && job.hardware_config?.queue
          ? {
              ...job,
              // eslint-disable-next-line camelcase -- API field name.
              hardware_config: { ...job.hardware_config, queue: undefined },
            }
          : job;
      setSelectedJob(namespace ? { job: modalJob, namespace } : undefined);
    },
    [evaluations, namespace],
  );

  const onSelectTab = React.useCallback(
    (_event: React.MouseEvent, selectedTab: string | number) => {
      const nextTab = String(selectedTab);
      if (nextTab === activeTab || !TAB_KEYS.includes(nextTab)) {
        return;
      }
      if (nextTab !== INDIVIDUAL_BENCHMARKS_TAB && selectedBenchmark) {
        setSelectedBenchmark(undefined);
      }

      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.set(TAB_QUERY_PARAM, nextTab);
      setSearchParams(nextSearchParams);
    },
    [activeTab, searchParams, selectedBenchmark, setSearchParams],
  );

  return (
    <>
      <Drawer isExpanded={!!selectedCollection || !!selectedBenchmark}>
        <DrawerContent
          className="evalhub-evaluations-drawer-content"
          panelContent={
            drawerKind === 'benchmark' ? (
              <BenchmarkDrawerPanel
                benchmark={selectedBenchmark}
                onClose={handleCloseDrawer}
                onRunBenchmark={handleRunBenchmark}
              />
            ) : (
              <CollectionDrawerPanel
                collection={selectedCollection}
                benchmarkDetailsMap={benchmarkDetailsMap}
                onClose={handleCloseDrawer}
                onRunCollection={handleDrawerRunCollection}
                onCustomizeCollection={handleDuplicateCollection}
                isSystemCollection={selectedCollectionIsSystem}
                primaryActionLabel="Run"
              />
            )
          }
        >
          <DrawerContentBody className="evalhub-evaluations-drawer-body">
            <div className="evalhub-evaluations-page">
              <ApplicationsPage
                title={
                  <EvalHubHeader
                    title="Evaluations"
                    projectContent={
                      <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                        <ProjectIconWithSize size={IconSize.LG} />
                        <FlexItem>
                          <Content component="p">Project</Content>
                        </FlexItem>
                        <FlexItem>
                          <EvalHubProjectSelector
                            namespace={namespace}
                            getRedirectPath={evalHubEvaluationsRoute}
                          />
                        </FlexItem>
                      </Flex>
                    }
                  />
                }
                description={EVALUATE_DESCRIPTION}
                headerAction={
                  showHeaderActions ? (
                    <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                      {canImport ? (
                        <Button
                          variant="secondary"
                          onClick={() => setIsImportOpen(true)}
                          data-testid="import-collection-button"
                        >
                          Import collection
                        </Button>
                      ) : (
                        <Tooltip content={importDisabledTooltip}>
                          {/* Span wrapper: hover events do not fire on a disabled button;
                              tabIndex keeps the tooltip reachable by keyboard. */}
                          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focus proxy for the disabled button so keyboard users can reach the tooltip */}
                          <span tabIndex={0}>
                            <Button
                              variant="secondary"
                              isDisabled
                              data-testid="import-collection-button"
                            >
                              Import collection
                            </Button>
                          </span>
                        </Tooltip>
                      )}
                      <Button
                        variant="primary"
                        onClick={handleCreateCollection}
                        data-testid="create-suite-button"
                      >
                        Create collection
                      </Button>
                    </Flex>
                  ) : undefined
                }
                loaded={healthLoaded && (!isHealthy || !isRunsTab || loaded)}
                loadError={!isHealthy ? healthError : isRunsTab ? error : undefined}
                loadErrorPage={
                  <PageSection hasBodyWrapper={false} isFilled>
                    {clusterAdmin ? (
                      <EmptyState
                        headingLevel="h4"
                        icon={CogIcon}
                        titleText="Evaluations unavailable"
                        variant={EmptyStateVariant.lg}
                        data-testid="evalhub-load-error-admin-empty-state"
                      >
                        <EmptyStateBody>
                          EvalHub custom resources are currently unavailable. To use evaluations,
                          complete the EvalHub custom resources configuration.
                        </EmptyStateBody>
                      </EmptyState>
                    ) : (
                      <EmptyState
                        headingLevel="h4"
                        icon={SupportIcon}
                        titleText="Evaluations unavailable"
                        variant={EmptyStateVariant.lg}
                        data-testid="evalhub-load-error-nonadmin-empty-state"
                      >
                        <EmptyStateBody>
                          Evaluations are unavailable due to an incomplete configuration. To use
                          this feature, contact your administrator.
                        </EmptyStateBody>
                        <EmptyStateFooter>
                          <WhosMyAdministrator />
                        </EmptyStateFooter>
                      </EmptyState>
                    )}
                  </PageSection>
                }
                empty={healthLoaded && !isHealthy && !healthError}
                emptyStatePage={
                  <PageSection hasBodyWrapper={false} isFilled>
                    {clusterAdmin ? (
                      <EmptyState
                        headingLevel="h4"
                        icon={CogIcon}
                        titleText="Evaluations unavailable"
                        variant={EmptyStateVariant.lg}
                        data-testid="evalhub-unavailable-empty-state"
                      >
                        <EmptyStateBody>
                          To use evaluations, enable the evaluation service using the TrustyAI
                          Operator.
                        </EmptyStateBody>
                      </EmptyState>
                    ) : (
                      <EmptyState
                        headingLevel="h4"
                        icon={SupportIcon}
                        titleText="Admin configuration required"
                        variant={EmptyStateVariant.lg}
                        data-testid="evalhub-nonadmin-empty-state"
                      >
                        <EmptyStateBody>
                          To use this service, request that your administrator enable evaluations
                          for this cluster.
                        </EmptyStateBody>
                        <EmptyStateFooter>
                          <WhosMyAdministrator />
                        </EmptyStateFooter>
                      </EmptyState>
                    )}
                  </PageSection>
                }
                provideChildrenPadding
                removeChildrenTopPadding
                keepBodyWrapper={false}
              >
                <Alert
                  isInline
                  isPlain
                  variant="info"
                  title={
                    <>
                      <span className="pf-v6-u-font-weight-normal">The </span>
                      AI Evaluations UI is in Technology Preview;{' '}
                      <span className="pf-v6-u-font-weight-normal">
                        the AI Evaluations back end is Generally Available.
                      </span>
                    </>
                  }
                  data-testid="evalhub-tech-preview-alert"
                  className="pf-v6-u-mb-lg"
                />
                <Tabs
                  activeKey={activeTab}
                  onSelect={onSelectTab}
                  aria-label="Evaluations page tabs"
                  data-testid="evaluations-page-tabs"
                  className="evalhub-evaluations-page__tabs"
                  inset={{ default: 'insetNone' }}
                  mountOnEnter
                >
                  <Tab
                    eventKey={GALLERY_TAB}
                    title={<TabTitleText>Gallery</TabTitleText>}
                    aria-label="Gallery tab"
                    data-testid="gallery-tab"
                  >
                    <GalleryTab
                      namespace={namespace ?? ''}
                      benchmarkNameMap={benchmarkNameMap}
                      onSelectCollection={(collection) => handleSelectCollection(collection, true)}
                      onRunSuccess={handleRunSuccess}
                    />
                  </Tab>
                  <Tab
                    eventKey={EVALUATE_TAB}
                    title={<TabTitleText>Custom collections</TabTitleText>}
                    aria-label="Custom collections tab"
                    data-testid="evaluate-tab"
                  >
                    <CustomCollectionsTab
                      namespace={namespace ?? ''}
                      benchmarkNameMap={benchmarkNameMap}
                      emptyState={
                        <EvalHubCollectionsEmptyState
                          onViewGallery={handleViewGallery}
                          onCreateCollection={handleCreateCollection}
                          onImportCollection={() => setIsImportOpen(true)}
                          isImportDisabled={!canImport}
                          importDisabledTooltip={importDisabledTooltip}
                        />
                      }
                      onSelectCollection={handleSelectCollection}
                      onRunCollection={handleRunCollection}
                      onEditCollection={handleEditCollection}
                      onDuplicateCollection={handleEvaluateDuplicateCollection}
                    />
                  </Tab>
                  <Tab
                    eventKey={INDIVIDUAL_BENCHMARKS_TAB}
                    title={<TabTitleText>Individual benchmarks</TabTitleText>}
                    aria-label="Individual benchmarks tab"
                    data-testid="individual-benchmarks-tab"
                  >
                    <IndividualBenchmarksTab
                      namespace={namespace ?? ''}
                      selectedBenchmark={selectedBenchmark}
                      onSelectBenchmark={handleSelectBenchmark}
                    />
                  </Tab>
                  <Tab
                    eventKey={RUNS_TAB}
                    title={<TabTitleText>Runs</TabTitleText>}
                    aria-label="Runs tab"
                    data-testid="runs-tab"
                  >
                    <Stack
                      className="evalhub-evaluations-tab-content evalhub-runs-tab"
                      data-testid="runs-tab-content"
                    >
                      {evaluations.length > 0 && (
                        <StackItem>
                          <Content
                            component="p"
                            className={`evalhub-runs-tab__description${
                              evaluationsResult.truncated
                                ? ' evalhub-runs-tab__description--with-alert'
                                : ''
                            }`}
                            data-testid="runs-tab-description"
                          >
                            {RUNS_DESCRIPTION}
                          </Content>
                        </StackItem>
                      )}
                      {evaluationsResult.truncated && (
                        <StackItem>
                          <Alert
                            variant="warning"
                            isInline
                            title="Evaluation runs list is incomplete"
                            className="pf-v6-u-mb-md"
                            data-testid="evaluations-truncated-alert"
                          >
                            Showing {evaluations.length} of {evaluationsResult.totalCount}{' '}
                            evaluation runs.
                          </Alert>
                        </StackItem>
                      )}
                      <StackItem>
                        {evaluations.length === 0 ? (
                          <EvalHubEmptyState
                            onViewGallery={handleViewGallery}
                            onCreateCollection={handleCreateCollection}
                            onImportCollection={() => setIsImportOpen(true)}
                            isImportDisabled={!canImport}
                            importDisabledTooltip={importDisabledTooltip}
                          />
                        ) : (
                          <EvaluationsTable
                            evaluations={enrichedEvaluations}
                            loaded={loaded}
                            namespace={namespace}
                            collectionNameMap={collectionNameMap}
                            collectionsLoaded={collectionsLoaded}
                            onRefresh={refreshEvaluations}
                            onShowStatus={onShowStatus}
                          />
                        )}
                      </StackItem>
                    </Stack>
                  </Tab>
                </Tabs>
              </ApplicationsPage>
            </div>
          </DrawerContentBody>
        </DrawerContent>
      </Drawer>
      {selectedJob && selectedJob.namespace === namespace ? (
        <React.Suspense
          fallback={
            <Bullseye>
              <Spinner />
            </Bullseye>
          }
        >
          <EvaluationStatusModal
            job={selectedJob.job}
            namespace={selectedJob.namespace}
            polledJobData={polledJobData}
            onClose={() => setSelectedJob(undefined)}
            onRequestStop={(job) => {
              setSelectedJob(undefined);
              setPendingStopJob(job);
            }}
            onRequestReconfigure={(job) => {
              setSelectedJob(undefined);
              navigate(evaluationReconfigureRoute(namespace, job.resource.id));
            }}
          />
        </React.Suspense>
      ) : null}
      {pendingStopJob && namespace && (
        <StopEvaluationModal
          job={pendingStopJob}
          namespace={namespace}
          onClose={() => setPendingStopJob(undefined)}
          onComplete={refreshEvaluations}
        />
      )}
      {isImportOpen ? (
        <React.Suspense fallback={null}>
          <ImportCollectionModal
            isOpen
            onClose={() => setIsImportOpen(false)}
            namespace={namespace ?? ''}
            surface={headerSurface}
          />
        </React.Suspense>
      ) : null}
      {collectionToRun ? (
        <StartEvaluationRunModal
          isOpen
          onClose={() => setCollectionToRun(undefined)}
          namespace={namespace}
          collection={collectionToRun}
          isCollectionFlow
          modalId="evaluations-page-start-evaluation-run-modal"
          trackingSource="evaluations_page"
          onSuccess={handleRunSuccess}
        />
      ) : null}
      {curatedCollectionToRun ? (
        <CuratedSuiteRunModal
          isOpen
          onClose={() => setCuratedCollectionToRun(undefined)}
          namespace={namespace}
          collection={curatedCollectionToRun}
          trackingSource="curated_gallery"
          onSuccess={handleRunSuccess}
        />
      ) : null}
    </>
  );
};

export default EvaluationsPage;
