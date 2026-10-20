import type { FlatBenchmark } from '~/app/types';

export type BenchmarkSuggestion = {
  benchmark: FlatBenchmark;
  key: string;
  score: number;
  reasons: string[];
};

const getSuggestionKey = (benchmark: FlatBenchmark): string =>
  `${benchmark.providerId}:${benchmark.id}`;

// Generic words that appear in many benchmark names and carry no relatedness signal.
const TOKEN_STOPWORDS = new Set(['benchmark']);

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !TOKEN_STOPWORDS.has(token));

const getBenchmarkTokens = (benchmark: FlatBenchmark): string[] => {
  const tokens = [...tokenize(benchmark.id), ...tokenize(benchmark.name)];
  return [...new Set(tokens)];
};

type SelectionProfile = {
  tasks: Set<string>;
  domains: Set<string>;
  categories: Set<string>;
  tags: Set<string>;
  tokens: Set<string>;
  providerIds: Set<string>;
};

const buildSelectionProfile = (
  benchmarks: FlatBenchmark[],
  selectedKeys: ReadonlySet<string>,
): SelectionProfile => {
  const profile: SelectionProfile = {
    tasks: new Set(),
    domains: new Set(),
    categories: new Set(),
    tags: new Set(),
    tokens: new Set(),
    providerIds: new Set(),
  };

  benchmarks.forEach((benchmark) => {
    if (!selectedKeys.has(getSuggestionKey(benchmark))) {
      return;
    }

    (benchmark.tasks ?? []).forEach((task) => profile.tasks.add(task));
    (benchmark.domains ?? []).forEach((domain) => profile.domains.add(domain));
    if (benchmark.category) {
      profile.categories.add(benchmark.category);
    }
    (benchmark.tags ?? []).forEach((tag) => profile.tags.add(tag));
    getBenchmarkTokens(benchmark).forEach((token) => profile.tokens.add(token));
    profile.providerIds.add(benchmark.providerId);
  });

  return profile;
};

const cappedOverlap = (values: readonly string[], profileValues: ReadonlySet<string>): string[] =>
  values.filter((value) => profileValues.has(value));

/**
 * Deterministic, metadata-driven benchmark suggestions — the hardcoded stand-in for a future
 * AI-backed suggestion API. Scores candidates against the selection's profile using the
 * provider-populated controlled vocabularies (tasks, domains) with category, tags, and
 * id/name token overlap as secondary signals.
 */
export const getBenchmarkSuggestions = (
  benchmarks: FlatBenchmark[],
  selectedKeys: readonly string[],
  limit: number,
): BenchmarkSuggestion[] => {
  if (benchmarks.length === 0 || selectedKeys.length === 0 || limit <= 0) {
    return [];
  }

  const profile = buildSelectionProfile(benchmarks, new Set(selectedKeys));

  const suggestions = benchmarks.flatMap((benchmark) => {
    const key = getSuggestionKey(benchmark);
    if (selectedKeys.includes(key)) {
      return [];
    }

    const sharedTasks = cappedOverlap(benchmark.tasks ?? [], profile.tasks);
    const sharedDomains = cappedOverlap(benchmark.domains ?? [], profile.domains);
    const sharedTags = cappedOverlap(benchmark.tags ?? [], profile.tags);
    const sharedTokens = cappedOverlap(getBenchmarkTokens(benchmark), profile.tokens).slice(0, 3);

    let score = Math.min(3 * sharedTasks.length, 6);
    score += Math.min(2 * sharedDomains.length, 4);
    if (benchmark.category && profile.categories.has(benchmark.category)) {
      score += 2;
    }
    score += Math.min(sharedTags.length, 3);
    score += Math.min(sharedTokens.length, 3);

    // Provider affinity alone is not a suggestion — require at least one content signal.
    if (score <= 0) {
      return [];
    }

    if (profile.providerIds.has(benchmark.providerId)) {
      score += 1;
    }

    const reasons: string[] = [
      ...sharedTasks.map((task) => `Task: ${task}`),
      ...sharedDomains.map((domain) => `Domain: ${domain}`),
    ];
    if (benchmark.category && profile.categories.has(benchmark.category)) {
      reasons.push(`Category: ${benchmark.category}`);
    }
    if (sharedTags.length > 0) {
      reasons.push(`Tags: ${sharedTags.join(', ')}`);
    }
    if (sharedTokens.length > 0) {
      reasons.push(`Similar name: ${sharedTokens.join(', ')}`);
    }

    return [{ benchmark, key, score, reasons }];
  });

  return suggestions
    .toSorted(
      (left, right) =>
        right.score - left.score ||
        (left.benchmark.name || left.benchmark.id).localeCompare(
          right.benchmark.name || right.benchmark.id,
        ) ||
        left.key.localeCompare(right.key),
    )
    .slice(0, limit);
};
