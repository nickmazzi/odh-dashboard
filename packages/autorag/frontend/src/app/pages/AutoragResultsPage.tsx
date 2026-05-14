import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  DrawerPanelContent,
  DrawerHead,
  DrawerActions,
  DrawerCloseButton,
  DrawerPanelBody,
  Skeleton,
  Spinner,
  Split,
  SplitItem,
  Title,
  Truncate,
} from '@patternfly/react-core';
import { CogIcon, OpenDrawerRightIcon, RedoIcon, StopCircleIcon } from '@patternfly/react-icons';
import { ApplicationsPage } from 'mod-arch-shared';
import { loadRemote } from '@module-federation/runtime';
import React from 'react';
import { Link, useParams } from 'react-router';
import type { ResponsesTemplate } from '@odh-dashboard/plugin-core/types';
import AutoragHeader from '~/app/components/common/AutoragHeader/AutoragHeader';
import { EmbeddableChatbotPlayground } from '~/app/components/EmbeddablePlaygroundLoader';
import InvalidPipelineRun from '~/app/components/empty-states/InvalidPipelineRun';
import InvalidProject from '~/app/components/empty-states/InvalidProject';
import AutoragResults from '~/app/components/run-results/AutoragResults';
import AutoragInputParametersPanel from '~/app/components/run-results/AutoragInputParametersPanel';
import StopRunModal from '~/app/components/run-results/StopRunModal';
import { AutoragResultsContext, getAutoragContext } from '~/app/context/AutoragResultsContext';
import { useNamespaceSelectorWithPersistence } from '~/app/hooks/useNamespaceSelectorWithPersistence';
import { useAutoragRunActions } from '~/app/hooks/useAutoragRunActions';
import { useNotification } from '~/app/hooks/useNotification';
import { usePipelineRunQuery, useLlamaStackModelsQuery } from '~/app/hooks/queries';
import { useAutoragResults } from '~/app/hooks/useAutoragResults';
import { autoragExperimentsPathname, autoragReconfigurePathname } from '~/app/utilities/routes';
import { isRunTerminatable, isRunRetryable, parseErrorStatus } from '~/app/utilities/utils';

type DrawerState =
  | { type: 'run-details' }
  | {
      type: 'playground';
      secretName: string;
      responsesTemplate: ResponsesTemplate;
      patternName: string;
    }
  | null;

function AutoragResultsPage(): React.JSX.Element {
  const { namespace, runId } = useParams();
  const { namespaces, namespacesLoaded, namespacesLoadError } =
    useNamespaceSelectorWithPersistence();
  const [drawerContent, setDrawerContent] = React.useState<DrawerState>(null);
  const handleDrawerClose = React.useCallback(() => setDrawerContent(null), []);
  const [isStopModalOpen, setIsStopModalOpen] = React.useState(false);
  const { handleRetry, handleConfirmStop, isRetrying, isTerminating } = useAutoragRunActions(
    namespace ?? '',
    runId ?? '',
  );

  const noNamespaces = namespacesLoaded && namespaces.length === 0;
  const invalidNamespace =
    namespacesLoaded && !!namespace && !namespaces.map((ns) => ns.name).includes(namespace);

  const getRedirectPath = (ns: string) => `${autoragExperimentsPathname}/${ns}`;

  const notification = useNotification();

  const {
    data: pipelineRun,
    isPending: pipelineRunPending,
    isFetching: pipelineRunFetching,
    isError: pipelineRunError,
    error: pipelineRunLoadError,
  } = usePipelineRunQuery(runId, namespace);

  // Two-tier error strategy: polling errors (data already loaded) show a non-blocking
  // notification with stale data, while initial load errors (no data yet) show a full error page.
  const hasPreviousData = !!pipelineRun;
  const isPollingError = pipelineRunError && hasPreviousData;
  const isInitialLoadError = pipelineRunError && !hasPreviousData;

  React.useEffect(() => {
    if (isPollingError) {
      notification.warning(
        'Pipeline run status update failed',
        'The status update has failed consistently for multiple attempts. The displayed results may not reflect the current state of the pipeline run.',
      );
    }
  }, [isPollingError, notification]);

  const invalidPipelineRunId =
    isInitialLoadError &&
    pipelineRunLoadError instanceof Error &&
    parseErrorStatus(pipelineRunLoadError) === 404;

  // Fetch and process AutoRAG results using custom hook
  const {
    patterns,
    failedPatterns,
    isLoading: patternsLoading,
    isError: patternsError,
    error: patternsLoadError,
    refetch: refetchPatterns,
    ragPatternsBasePath,
  } = useAutoragResults(runId, namespace, pipelineRun);

  const failedPatternsNotifiedKey = React.useRef('');
  React.useEffect(() => {
    const key = [...failedPatterns].toSorted().join(',');
    if (failedPatterns.length > 0 && failedPatternsNotifiedKey.current !== key) {
      failedPatternsNotifiedKey.current = key;
      const total = failedPatterns.length + Object.keys(patterns).length;
      notification.warning(
        `${failedPatterns.length} of ${total} patterns could not be loaded`,
        `The following patterns failed to load: ${failedPatterns.join(', ')}`,
      );
    }
  }, [failedPatterns, patterns, notification]);

  const runTerminatable = isRunTerminatable(pipelineRun?.state);
  const runRetryable = isRunRetryable(pipelineRun?.state);

  const handleStop = React.useCallback(async () => {
    try {
      await handleConfirmStop();
      setIsStopModalOpen(false);
    } catch {
      // Keep modal open on failure; error notification is shown by the hook.
    }
  }, [handleConfirmStop]);

  const ReconfigureLink = React.useCallback(
    (props: React.ComponentProps<typeof Link>) => (
      <Link
        {...props}
        to={`${autoragReconfigurePathname}/${namespace}/${runId}`}
        state={{ from: 'results' }}
      />
    ),
    [namespace, runId],
  );

  // Playground feature gate: check if gen-ai remote loaded and LlamaStack is reachable
  const secretName =
    String(pipelineRun?.runtime_config?.parameters?.llama_stack_secret_name ?? '');
  const [isPlaygroundAvailable, setIsPlaygroundAvailable] = React.useState(false);

  React.useEffect(() => {
    loadRemote('genAi/EmbeddableChatbotPlayground')
      .then((mod) => setIsPlaygroundAvailable(mod != null))
      .catch(() => setIsPlaygroundAvailable(false));
  }, []);

  const { isSuccess: llamaStackAvailable } = useLlamaStackModelsQuery(
    namespace ?? '',
    secretName,
  );

  const contextValue = React.useMemo(
    () =>
      getAutoragContext({
        pipelineRun,
        patterns,
        pipelineRunLoading: pipelineRunPending || pipelineRunFetching,
        patternsLoading,
        patternsError,
        patternsLoadError,
        onRetryPatterns: refetchPatterns,
        ragPatternsBasePath,
        llamaStackInstanceAvailable: isPlaygroundAvailable && llamaStackAvailable,
      }),
    [
      pipelineRun,
      patterns,
      pipelineRunPending,
      pipelineRunFetching,
      patternsLoading,
      patternsError,
      patternsLoadError,
      refetchPatterns,
      ragPatternsBasePath,
      isPlaygroundAvailable,
      llamaStackAvailable,
    ],
  );

  const handleTryInPlayground = React.useCallback(
    (patternName: string) => {
      const pattern = patterns[patternName];
      const responsesTemplate = pattern.settings.responses_template;
      if (!responsesTemplate || !secretName) {
        return;
      }
      setDrawerContent({
        type: 'playground',
        secretName,
        responsesTemplate,
        patternName,
      });
    },
    [patterns, secretName],
  );

  return (
    <>
      <Drawer isExpanded={drawerContent != null} position={drawerContent?.type === 'playground' ? 'bottom' : 'end'}>
        <DrawerContent
          panelContent={
            drawerContent?.type === 'playground' ? (
              <DrawerPanelContent defaultSize="50%">
                <DrawerHead>
                  <Title headingLevel="h3">
                    Try &quot;{drawerContent.patternName}&quot; in Playground
                  </Title>
                  <DrawerActions>
                    <DrawerCloseButton onClick={handleDrawerClose} />
                  </DrawerActions>
                </DrawerHead>
                <DrawerPanelBody>
                  <React.Suspense fallback={<Spinner aria-label="Loading playground" />}>
                    <EmbeddableChatbotPlayground
                      namespace={namespace!}
                      secretName={drawerContent.secretName}
                      responsesTemplate={drawerContent.responsesTemplate}
                      patternName={drawerContent.patternName}
                      bffBasePath="/gen-ai/api/v1"
                    />
                  </React.Suspense>
                </DrawerPanelBody>
              </DrawerPanelContent>
            ) : (
              <AutoragInputParametersPanel
                onClose={handleDrawerClose}
                parameters={contextValue.parameters}
                isLoading={pipelineRunPending}
              />
            )
          }
        >
          <DrawerContentBody>
            <ApplicationsPage
              title={<AutoragHeader />}
              subtext={
                <h2 className="pf-v6-u-mt-sm">
                  {pipelineRun ? (
                    <span>
                      &quot;
                      <Truncate content={pipelineRun.display_name || ''} />
                      &quot; results
                    </span>
                  ) : (
                    <Skeleton width="300px" />
                  )}
                </h2>
              }
              headerAction={
                <Split hasGutter>
                  <SplitItem>
                    {runTerminatable && (
                      <Button
                        variant="secondary"
                        icon={<StopCircleIcon />}
                        onClick={() => setIsStopModalOpen(true)}
                        data-testid="stop-run-button"
                      >
                        Stop
                      </Button>
                    )}
                    {runRetryable && (
                      <Button
                        variant="secondary"
                        icon={<RedoIcon />}
                        onClick={() => void handleRetry().catch(() => undefined)}
                        isDisabled={isRetrying}
                        isLoading={isRetrying}
                        spinnerAriaValueText="Retrying run"
                        data-testid="retry-run-button"
                      >
                        Retry
                      </Button>
                    )}
                  </SplitItem>
                  <SplitItem>
                    <Button
                      variant="secondary"
                      icon={<CogIcon />}
                      component={ReconfigureLink}
                      data-testid="reconfigure-run-button"
                    >
                      Reconfigure
                    </Button>
                  </SplitItem>
                  <SplitItem>
                    <Button
                      variant="link"
                      icon={<OpenDrawerRightIcon />}
                      onClick={() =>
                        setDrawerContent((prev) =>
                          prev?.type === 'run-details' ? null : { type: 'run-details' },
                        )
                      }
                      aria-expanded={drawerContent?.type === 'run-details'}
                      data-testid="run-details-button"
                    >
                      Run details
                    </Button>
                  </SplitItem>
                </Split>
              }
              breadcrumb={
                <Breadcrumb>
                  <BreadcrumbItem>
                    <Link to={getRedirectPath(namespace!)}>AutoRAG: {namespace}</Link>
                  </BreadcrumbItem>
                  <BreadcrumbItem isActive>
                    <Truncate content={pipelineRun?.display_name || ''} />
                  </BreadcrumbItem>
                </Breadcrumb>
              }
              empty={noNamespaces || invalidNamespace || invalidPipelineRunId}
              emptyStatePage={
                invalidPipelineRunId ? (
                  <InvalidPipelineRun />
                ) : (
                  <InvalidProject namespace={namespace} getRedirectPath={getRedirectPath} />
                )
              }
              loadError={
                hasPreviousData ? undefined : (pipelineRunLoadError ?? namespacesLoadError)
              }
              loaded={namespacesLoaded && !pipelineRunPending}
            >
              <AutoragResultsContext.Provider value={contextValue}>
                <AutoragResults onTryInPlayground={handleTryInPlayground} />
              </AutoragResultsContext.Provider>
            </ApplicationsPage>
          </DrawerContentBody>
        </DrawerContent>
      </Drawer>
      <StopRunModal
        isOpen={isStopModalOpen}
        onClose={() => setIsStopModalOpen(false)}
        onConfirm={handleStop}
        isTerminating={isTerminating}
        runName={pipelineRun?.display_name}
      />
    </>
  );
}

export default AutoragResultsPage;
