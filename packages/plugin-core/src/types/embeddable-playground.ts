/**
 * Controls which playground features are visible in embedded mode.
 * All default to `false` — consumers pass nothing for a simplified chat-only UI.
 */
export type PlaygroundFeatureConfig = {
  showModelPicker?: boolean;
  showMcpServerConfig?: boolean;
  showRagToggle?: boolean;
  showCompareMode?: boolean;
  showViewCodeModal?: boolean;
  showNewChatModal?: boolean;
  showSystemInstructions?: boolean;
  showGuardrailConfig?: boolean;
};

/**
 * LlamaStack responses API template — the exact request body format
 * used by the AutoRAG optimizer during evaluation.
 */
export type ResponsesTemplate = {
  model: string;
  stream: boolean;
  store: boolean;
  input: Array<{
    type: 'message';
    role: 'user';
    content: Array<{
      type: 'input_text';
      text: string; // contains "<user_query_placeholder>" to be substituted
    }>;
  }>;
  metadata: {
    autorag_run_id: string;
    rag_pattern_name: string;
  };
  instructions: string;
  tools: Array<{
    type: 'file_search';
    vector_store_ids: string[];
    max_num_results: number;
    ranking_options: {
      search_mode: string;
      ranker_strategy: string;
      ranker_k: number;
      ranker_alpha: number;
    };
  }>;
  tool_choice: {
    type: string;
  };
  include: string[];
};

/**
 * Props for the embeddable chatbot playground component exposed via Module Federation.
 */
export type EmbeddableChatbotPlaygroundProps = {
  namespace: string;
  /** K8s secret name containing llama_stack_client_base_url and llama_stack_client_api_key */
  secretName: string;
  /** The pattern's responses_template from AutoRAG */
  responsesTemplate: ResponsesTemplate;
  /** Display name of the pattern for the chat header */
  patternName?: string;
  /** Gen-ai BFF base URL path (e.g., '/gen-ai/api/v1') */
  bffBasePath: string;
  /** Per-feature visibility overrides. All default to false (hidden). */
  features?: PlaygroundFeatureConfig;
};
