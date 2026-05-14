/* eslint-disable camelcase */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@patternfly/chatbot/dist/css/main.css';
import type {
  EmbeddableChatbotPlaygroundProps,
  PlaygroundFeatureConfig,
} from '@odh-dashboard/plugin-core/types';
import EmbeddedMessagesContext from '~/app/Chatbot/context/EmbeddedMessagesContext';
import PlaygroundFeaturesContext, {
  EMBEDDED_FEATURES,
  ResolvedPlaygroundFeatureConfig,
} from '~/app/Chatbot/context/PlaygroundFeaturesContext';
import { ChatbotContext } from '~/app/context/ChatbotContext';
import { GenAiContext } from '~/app/context/GenAiContext';
import { DEFAULT_CONFIG_ID, useChatbotConfigStore } from '~/app/Chatbot/store';
import ChatbotPlayground from './ChatbotPlayground';

/**
 * Resolves a partial PlaygroundFeatureConfig into a full ResolvedPlaygroundFeatureConfig,
 * defaulting all missing values to the embedded defaults (all false).
 */
const resolveFeatures = (overrides?: PlaygroundFeatureConfig): ResolvedPlaygroundFeatureConfig => ({
  ...EMBEDDED_FEATURES,
  ...overrides,
});

/**
 * Embeddable version of the chatbot playground designed to be loaded via Module Federation
 * by other packages (e.g., AutoRAG). Provides a simplified, chat-only UI with its own
 * scoped providers and minimal context stubs.
 *
 * TODO: Wire up actual message sending via useEmbeddedChatbotMessages / passthrough endpoint.
 * For now, the component renders the playground UI in embedded mode with all features hidden.
 */
const EmbeddableChatbotPlayground: React.FC<EmbeddableChatbotPlaygroundProps> = ({
  namespace,
  secretName,
  responsesTemplate,
  patternName,
  bffBasePath,
  features,
}) => {
  // Scoped QueryClient — isolated cache, disposed on unmount
  const queryClient = React.useMemo(() => new QueryClient(), []);

  const featureConfig = React.useMemo(() => resolveFeatures(features), [features]);

  const embeddedMessagesConfig = React.useMemo(
    () => ({ bffBasePath, namespace, secretName, responsesTemplate }),
    [bffBasePath, namespace, secretName, responsesTemplate],
  );

  // Stub GenAiContext — the embedded playground doesn't need the full API surface.
  // We provide namespace info and a no-op API state.
  const genAiContextValue = React.useMemo(
    () => ({
      namespace: { name: namespace },
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      apiState: { apiAvailable: false, api: null as never },
      refreshAPIState: () => undefined,
    }),
    [namespace],
  );

  // Stub ChatbotContext — synthesize a single model from the responses template.
  // The embedded playground doesn't fetch models from the cluster; it uses
  // the model specified in the AutoRAG responses template.
  const chatbotContextValue = React.useMemo(
    () => ({
      lsdStatus: {
        phase: 'Ready' as const,
        name: 'embedded',
        version: '',
        distributionConfig: {
          activeDistribution: '',
          providers: [],
          availableDistributions: {},
        },
      },
      modelsLoaded: true,
      lsdStatusLoaded: true,
      aiModels: [],
      aiModelsLoaded: true,
      aiModelsError: undefined,
      maasModels: [],
      maasModelsLoaded: true,
      maasModelsError: undefined,
      models: [
        {
          id: responsesTemplate.model,
          object: 'model',
          created: Date.now(),
          owned_by: 'embedded',
          modelId: responsesTemplate.model,
        },
      ],
      modelsError: undefined,
      lsdStatusError: undefined,
      nemoGuardrailsStatus: null,
      nemoGuardrailsStatusLoaded: true,
      nemoGuardrailsStatusError: undefined,
      refresh: () => undefined,
      lastInput: '',
      setLastInput: () => undefined,
    }),
    [responsesTemplate.model],
  );

  // Pre-select the model from the responses template in the config store
  React.useEffect(() => {
    useChatbotConfigStore
      .getState()
      .updateSelectedModel(DEFAULT_CONFIG_ID, responsesTemplate.model);
  }, [responsesTemplate.model]);

  // Placeholder state for view code and new chat modals (hidden in embedded mode)
  const [isViewCodeModalOpen, setIsViewCodeModalOpen] = React.useState(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = React.useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <GenAiContext.Provider value={genAiContextValue}>
        <ChatbotContext.Provider value={chatbotContextValue}>
          <EmbeddedMessagesContext.Provider value={embeddedMessagesConfig}>
          <PlaygroundFeaturesContext.Provider value={featureConfig}>
            <ChatbotPlayground
              isViewCodeModalOpen={isViewCodeModalOpen}
              setIsViewCodeModalOpen={setIsViewCodeModalOpen}
              isNewChatModalOpen={isNewChatModalOpen}
              setIsNewChatModalOpen={setIsNewChatModalOpen}
            />
            {patternName && (
              <span data-testid="embedded-playground-pattern" style={{ display: 'none' }}>
                {patternName}
              </span>
            )}
          </PlaygroundFeaturesContext.Provider>
          </EmbeddedMessagesContext.Provider>
        </ChatbotContext.Provider>
      </GenAiContext.Provider>
    </QueryClientProvider>
  );
};

export default EmbeddableChatbotPlayground;
