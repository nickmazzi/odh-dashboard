import type { FlatBenchmark } from '~/app/types';
import { getBenchmarkSuggestions } from '~/app/utilities/benchmarkSuggestions';

const createBenchmark = (overrides: Partial<FlatBenchmark>): FlatBenchmark => ({
  id: 'benchmark',
  name: 'Benchmark',
  providerId: 'provider',
  providerName: 'Provider',
  ...overrides,
});

const niahBenchmarks: FlatBenchmark[] = [
  createBenchmark({
    id: 'niah-single-noise',
    name: 'NIAH Single (Noise Haystack)',
    category: 'needle_in_a_haystack',
    tags: ['ruler', 'niah', 'retrieval'],
    domains: ['grounded_document_understanding'],
    tasks: ['long_context_understanding'],
  }),
  createBenchmark({
    id: 'niah-single-essay',
    name: 'NIAH Single (Essay Haystack)',
    category: 'needle_in_a_haystack',
    tags: ['ruler', 'niah'],
    domains: ['grounded_document_understanding'],
    tasks: ['long_context_understanding'],
  }),
  createBenchmark({
    id: 'variable-tracking',
    name: 'Variable Tracking',
    category: 'variable_tracking',
    tags: ['ruler', 'tracking'],
    domains: ['grounded_document_understanding'],
    tasks: ['long_context_understanding'],
  }),
  createBenchmark({
    id: 'qa-squad',
    name: 'QA SQuAD',
    category: 'question_answering',
    tags: ['ruler', 'qa'],
    domains: ['grounded_document_understanding'],
    tasks: ['full_document_qa'],
  }),
  createBenchmark({
    id: 'owasp_llm_top10',
    name: 'OWASP LLM Top 10',
    category: 'security',
    tags: ['garak'],
    domains: ['trustworthiness'],
    tasks: ['adversarial_prompt_injection_resistance'],
  }),
  createBenchmark({
    id: 'intents',
    name: 'Intents',
    category: 'security',
    tags: ['garak'],
    domains: ['trustworthiness'],
    tasks: ['adversarial_prompt_injection_resistance'],
    providerId: 'garak',
    providerName: 'Garak',
  }),
  createBenchmark({
    id: 'arc_easy',
    name: 'Basic science Q&A',
    category: 'reasoning',
    tags: ['lm_eval'],
    domains: ['knowledge_and_reasoning'],
    tasks: ['reasoning'],
    providerId: 'lm_eval',
    providerName: 'LM Evaluation Harness',
  }),
];

describe('getBenchmarkSuggestions', () => {
  it('should rank benchmarks sharing tasks and domains above weaker matches', () => {
    const suggestions = getBenchmarkSuggestions(niahBenchmarks, ['provider:niah-single-noise'], 10);

    expect(suggestions[0]?.benchmark.id).toBe('niah-single-essay');
    expect(suggestions[1]?.benchmark.id).toBe('variable-tracking');
    // qa-squad shares only the domain and provider tokens, not the task
    expect(suggestions[2]?.benchmark.id).toBe('qa-squad');
  });

  it('should rank exact task matches across providers above category-only matches', () => {
    const suggestions = getBenchmarkSuggestions(niahBenchmarks, ['provider:owasp_llm_top10'], 10);

    expect(suggestions[0]?.benchmark.id).toBe('intents');
  });

  it('should exclude already-selected benchmarks', () => {
    const suggestions = getBenchmarkSuggestions(
      niahBenchmarks,
      ['provider:niah-single-noise', 'provider:niah-single-essay'],
      10,
    );

    expect(suggestions.map((suggestion) => suggestion.key)).not.toContain(
      'provider:niah-single-noise',
    );
    expect(suggestions.map((suggestion) => suggestion.key)).not.toContain(
      'provider:niah-single-essay',
    );
  });

  it('should include task, domain, category, tag, and name reasons', () => {
    const suggestions = getBenchmarkSuggestions(niahBenchmarks, ['provider:niah-single-noise'], 10);

    const essay = suggestions.find((suggestion) => suggestion.key === 'provider:niah-single-essay');
    expect(essay?.reasons).toContain('Task: long_context_understanding');
    expect(essay?.reasons).toContain('Domain: grounded_document_understanding');
    expect(essay?.reasons).toContain('Category: needle_in_a_haystack');
    expect(essay?.reasons).toContain('Tags: ruler, niah');
    expect(essay?.reasons).toContain('Similar name: niah, single, haystack');
  });

  it('should apply the same-provider bonus', () => {
    // Both candidates share a tag with the selection; the same-provider one must outrank the other.
    const benchmarks = [
      createBenchmark({
        id: 'selected',
        name: 'Selected',
        tags: ['shared'],
        providerId: 'provider-a',
        providerName: 'Provider A',
      }),
      createBenchmark({
        id: 'same-provider',
        name: 'Same provider',
        tags: ['shared'],
        providerId: 'provider-a',
        providerName: 'Provider A',
      }),
      createBenchmark({
        id: 'other-provider',
        name: 'Other provider',
        tags: ['shared'],
        providerId: 'provider-b',
        providerName: 'Provider B',
      }),
    ];

    const suggestions = getBenchmarkSuggestions(benchmarks, ['provider-a:selected'], 10);

    expect(suggestions[0]?.benchmark.id).toBe('same-provider');
    expect(suggestions[1]?.benchmark.id).toBe('other-provider');
  });

  it('should respect the limit', () => {
    const benchmarks = Array.from({ length: 15 }, (_, index) =>
      createBenchmark({
        id: `related-${index}`,
        name: `Related ${index}`,
        tasks: ['reasoning'],
        domains: ['knowledge_and_reasoning'],
      }),
    );
    benchmarks.unshift(createBenchmark({ id: 'selected', name: 'Selected', tasks: ['reasoning'] }));

    expect(getBenchmarkSuggestions(benchmarks, ['provider:selected'], 10)).toHaveLength(10);
    expect(getBenchmarkSuggestions(benchmarks, ['provider:selected'], 0)).toHaveLength(0);
  });

  it('should break score ties by name, then key', () => {
    const benchmarks = [
      createBenchmark({ id: 'selected', name: 'Selected', tasks: ['reasoning'] }),
      createBenchmark({ id: 'zeta', name: 'Zeta', tasks: ['reasoning'] }),
      createBenchmark({ id: 'alpha', name: 'Alpha', tasks: ['reasoning'] }),
    ];

    const suggestions = getBenchmarkSuggestions(benchmarks, ['provider:selected'], 10);

    expect(suggestions.map((suggestion) => suggestion.benchmark.id)).toEqual(['alpha', 'zeta']);
  });

  it('should return no suggestions without overlap', () => {
    const benchmarks = [
      createBenchmark({ id: 'selected', name: 'Selected', tasks: ['reasoning'] }),
      createBenchmark({ id: 'unrelated', name: 'Unrelated', tasks: ['safety'] }),
    ];

    expect(getBenchmarkSuggestions(benchmarks, ['provider:selected'], 10)).toHaveLength(0);
  });

  it('should handle empty inputs and missing optional fields', () => {
    expect(getBenchmarkSuggestions([], ['provider:selected'], 10)).toHaveLength(0);
    expect(getBenchmarkSuggestions(niahBenchmarks, [], 10)).toHaveLength(0);

    const benchmarks = [
      createBenchmark({ id: 'selected', name: 'Selected' }),
      createBenchmark({ id: 'minimal', name: 'Minimal' }),
    ];
    expect(() => getBenchmarkSuggestions(benchmarks, ['provider:selected'], 10)).not.toThrow();
  });

  it('should score shared tasks and domains above a category-only match', () => {
    const benchmarks = [
      createBenchmark({
        id: 'selected',
        name: 'Selected',
        category: 'reasoning',
        tasks: ['reasoning'],
        domains: ['knowledge_and_reasoning'],
      }),
      createBenchmark({
        id: 'both-signals',
        name: 'Both signals',
        category: 'other',
        tasks: ['reasoning'],
        domains: ['knowledge_and_reasoning'],
      }),
      createBenchmark({ id: 'category-only', name: 'Category only', category: 'reasoning' }),
    ];

    const suggestions = getBenchmarkSuggestions(benchmarks, ['provider:selected'], 10);

    expect(suggestions[0]?.benchmark.id).toBe('both-signals');
    expect(suggestions[1]?.benchmark.id).toBe('category-only');
  });
});
