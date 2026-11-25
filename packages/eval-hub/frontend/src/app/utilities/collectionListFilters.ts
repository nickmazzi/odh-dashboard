import { CollectionSortOption } from '~/app/pages/const';
import type { Collection } from '~/app/types';

export const COLLECTION_SORT_VALUES: readonly string[] = Object.values(CollectionSortOption);

export const isCollectionSortOption = (value: unknown): value is CollectionSortOption =>
  typeof value === 'string' && COLLECTION_SORT_VALUES.includes(value);

const compareCollectionNames = (first: Collection, second: Collection): number => {
  const nameComparison = first.name.localeCompare(second.name, undefined, {
    sensitivity: 'base',
  });
  return nameComparison || first.resource.id.localeCompare(second.resource.id);
};

const getCollectionCreatedAtTime = (collection: Collection): number | undefined => {
  const createdAt = collection.resource.created_at;
  if (!createdAt) {
    return undefined;
  }

  const createdAtTime = Date.parse(createdAt);
  return Number.isNaN(createdAtTime) ? undefined : createdAtTime;
};

/**
 * Orders benchmark collections for the gallery. Collections without a usable creation timestamp
 * sort after dated ones so incomplete API data never hides the most recent collections.
 */
export const sortCollections = <T extends Collection>(
  collections: T[],
  sortOption: CollectionSortOption,
): T[] => {
  switch (sortOption) {
    case CollectionSortOption.DATE_CREATED_ASC:
      return collections.toSorted((first, second) => {
        const firstCreatedAt = getCollectionCreatedAtTime(first);
        const secondCreatedAt = getCollectionCreatedAtTime(second);

        if (firstCreatedAt === undefined || secondCreatedAt === undefined) {
          if (firstCreatedAt === secondCreatedAt) {
            return compareCollectionNames(first, second);
          }
          return firstCreatedAt === undefined ? 1 : -1;
        }

        return firstCreatedAt - secondCreatedAt || compareCollectionNames(first, second);
      });
    case CollectionSortOption.NAME_ASC:
      return collections.toSorted(compareCollectionNames);
    case CollectionSortOption.NAME_DESC:
      return collections.toSorted((first, second) => -compareCollectionNames(first, second));
    case CollectionSortOption.DATE_CREATED_DESC:
    default:
      return collections.toSorted((first, second) => {
        const firstCreatedAt = getCollectionCreatedAtTime(first);
        const secondCreatedAt = getCollectionCreatedAtTime(second);

        if (firstCreatedAt === undefined || secondCreatedAt === undefined) {
          if (firstCreatedAt === secondCreatedAt) {
            return compareCollectionNames(first, second);
          }
          return firstCreatedAt === undefined ? 1 : -1;
        }

        return secondCreatedAt - firstCreatedAt || compareCollectionNames(first, second);
      });
  }
};
