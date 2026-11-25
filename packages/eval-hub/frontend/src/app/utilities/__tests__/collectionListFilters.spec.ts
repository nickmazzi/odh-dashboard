import { CollectionSortOption } from '~/app/pages/const';
import type { Collection } from '~/app/types';
import { isCollectionSortOption, sortCollections } from '~/app/utilities/collectionListFilters';

const collection = (id: string, name: string, createdAt?: string): Collection => ({
  // eslint-disable-next-line camelcase
  resource: { id, ...(createdAt ? { created_at: createdAt } : {}) },
  name,
});

describe('isCollectionSortOption', () => {
  it('should accept supported sort options', () => {
    expect(isCollectionSortOption(CollectionSortOption.DATE_CREATED_DESC)).toBe(true);
    expect(isCollectionSortOption(CollectionSortOption.DATE_CREATED_ASC)).toBe(true);
    expect(isCollectionSortOption(CollectionSortOption.NAME_ASC)).toBe(true);
    expect(isCollectionSortOption(CollectionSortOption.NAME_DESC)).toBe(true);
  });

  it('should reject unsupported sort options', () => {
    expect(isCollectionSortOption('most_recent')).toBe(false);
    expect(isCollectionSortOption('curation_order')).toBe(false);
    expect(isCollectionSortOption('invalid')).toBe(false);
    expect(isCollectionSortOption(undefined)).toBe(false);
  });
});

describe('sortCollections', () => {
  const oldest = collection('oldest', 'Zeta suite', '2026-01-01T00:00:00Z');
  const newest = collection('newest', 'Alpha suite', '2026-03-01T00:00:00Z');
  const middle = collection('middle', 'Beta suite', '2026-02-01T00:00:00Z');
  const undated = collection('undated', 'Gamma suite');

  it('should sort date created newest first by default', () => {
    expect(
      sortCollections(
        [oldest, newest, middle, undated],
        CollectionSortOption.DATE_CREATED_DESC,
      ).map((item) => item.resource.id),
    ).toEqual(['newest', 'middle', 'oldest', 'undated']);
  });

  it('should sort date created oldest first', () => {
    expect(
      sortCollections([newest, undated, oldest, middle], CollectionSortOption.DATE_CREATED_ASC).map(
        (item) => item.resource.id,
      ),
    ).toEqual(['oldest', 'middle', 'newest', 'undated']);
  });

  it('should break timestamp ties by collection name', () => {
    const secondAlpha = collection('other-alpha', 'alpha suite', '2026-03-01T00:00:00Z');

    expect(
      sortCollections([secondAlpha, newest], CollectionSortOption.DATE_CREATED_DESC).map(
        (item) => item.resource.id,
      ),
    ).toEqual(['newest', 'other-alpha']);
  });

  it('should sort by name case-insensitively', () => {
    expect(
      sortCollections([oldest, newest, middle], CollectionSortOption.NAME_ASC).map(
        (item) => item.resource.id,
      ),
    ).toEqual(['newest', 'middle', 'oldest']);
  });

  it('should sort by name in reverse', () => {
    expect(
      sortCollections([newest, oldest, middle], CollectionSortOption.NAME_DESC).map(
        (item) => item.resource.id,
      ),
    ).toEqual(['oldest', 'middle', 'newest']);
  });

  it('should not mutate the input array', () => {
    const collections = [oldest, newest, middle];
    sortCollections(collections, CollectionSortOption.NAME_ASC);

    expect(collections.map((item) => item.resource.id)).toEqual(['oldest', 'newest', 'middle']);
  });
});
