export enum BenchmarkFilterOptions {
  category = 'Category',
  evaluates = 'Evaluates',
  name = 'Name',
  metrics = 'Metrics',
  framework = 'Framework',
}

export type BenchmarkFilterDataType = {
  [BenchmarkFilterOptions.category]: string[];
  [BenchmarkFilterOptions.evaluates]: string[];
  [BenchmarkFilterOptions.name]: string;
  [BenchmarkFilterOptions.metrics]: string[];
  [BenchmarkFilterOptions.framework]: string[];
};

export const initialBenchmarkFilterData: BenchmarkFilterDataType = {
  [BenchmarkFilterOptions.category]: [],
  [BenchmarkFilterOptions.evaluates]: [],
  [BenchmarkFilterOptions.name]: '',
  [BenchmarkFilterOptions.metrics]: [],
  [BenchmarkFilterOptions.framework]: [],
};

export const SUITE_EVALUATES_OPTIONS = ['agent', 'guardrails', 'model', 'traces'] as const;

// TEMP: Keep model-only behavior until EvalHub supports more evaluation_targets; restore this code when support is added.
export const MODEL_EVALUATION_TARGETS = ['model'] as const;

// TODO: Enable Guardrails and Traces when the backend supports creating suites for those targets.
export const SUITE_EVALUATES_MENU_OPTIONS = [
  'agent',
  // 'guardrails',
  'model',
  // 'traces',
] as const;

export const COLLECTION_CATEGORY_OPTIONS = [
  'grounded_document_understanding',
  'instruction_and_output_reliability',
  'knowledge_and_reasoning',
  'multilingual',
  'multimodal',
  'software',
  'tool_use_and_function_calling',
  'trustworthiness',
] as const;

export type CollectionCategory = (typeof COLLECTION_CATEGORY_OPTIONS)[number];

const COLLECTION_CATEGORY_SET = new Set<string>(COLLECTION_CATEGORY_OPTIONS);

export const isCollectionCategory = (value: unknown): value is CollectionCategory =>
  typeof value === 'string' && COLLECTION_CATEGORY_SET.has(value);

export const COLLECTION_METADATA_OPTIONS = {
  domains: COLLECTION_CATEGORY_OPTIONS,
  tasks: [
    'abstention',
    'adversarial_injection',
    'call_generation',
    'calibration',
    'citation_attribution',
    'code_generation',
    'code_repair',
    'code_understanding',
    'constraint_following',
    'data_analysis',
    'document_chart_vqa',
    'extraction',
    'full_document_qa',
    'general_visual_reasoning',
    'grounding_discipline',
    'instruction_following',
    'long_context_understanding',
    'rag',
    'reasoning',
    'safety',
    'structured_output',
    'summarization',
    'translation',
  ],
  modalities: ['multimodal', 'text', 'vision'],
  industries: ['financial', 'government', 'health', 'telco'],
} as const;

export type SuiteEvaluatesOption = (typeof SUITE_EVALUATES_OPTIONS)[number];

export const isSuiteEvaluatesOption = (value: unknown): value is SuiteEvaluatesOption => {
  if (typeof value !== 'string') {
    return false;
  }
  return SUITE_EVALUATES_OPTIONS.some((option) => option === value);
};

export enum BenchmarkSortOption {
  DEFAULT = 'default',
  NAME = 'name',
  CATEGORY = 'category',
}

export const benchmarkSortLabels: Record<BenchmarkSortOption, string> = {
  [BenchmarkSortOption.DEFAULT]: 'Default',
  [BenchmarkSortOption.NAME]: 'Name',
  [BenchmarkSortOption.CATEGORY]: 'Category',
};

/** Sort orders offered by the individual benchmark catalog. */
export enum BenchmarkCatalogSortOption {
  NAME_ASC = 'name_asc',
  NAME_DESC = 'name_desc',
  CATEGORY_ASC = 'category_asc',
  CATEGORY_DESC = 'category_desc',
}

export const benchmarkCatalogSortLabels: Record<BenchmarkCatalogSortOption, string> = {
  [BenchmarkCatalogSortOption.NAME_ASC]: 'Name (A–Z)',
  [BenchmarkCatalogSortOption.NAME_DESC]: 'Name (Z–A)',
  [BenchmarkCatalogSortOption.CATEGORY_ASC]: 'Category (A–Z)',
  [BenchmarkCatalogSortOption.CATEGORY_DESC]: 'Category (Z–A)',
};

/** Sort orders offered by the benchmark collection gallery. */
export enum CollectionSortOption {
  DATE_CREATED_DESC = 'date_created_desc',
  DATE_CREATED_ASC = 'date_created_asc',
  NAME_ASC = 'name_asc',
  NAME_DESC = 'name_desc',
}

export const collectionSortLabels: Record<CollectionSortOption, string> = {
  [CollectionSortOption.DATE_CREATED_DESC]: 'Date created (newest first)',
  [CollectionSortOption.DATE_CREATED_ASC]: 'Date created (oldest first)',
  [CollectionSortOption.NAME_ASC]: 'Name (A–Z)',
  [CollectionSortOption.NAME_DESC]: 'Name (Z–A)',
};
