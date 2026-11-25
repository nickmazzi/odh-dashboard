import {
  COLLECTION_CATEGORY_OPTIONS,
  SUITE_EVALUATES_OPTIONS,
  isCollectionCategory,
  isSuiteEvaluatesOption,
} from '~/app/pages/const';

describe('isCollectionCategory', () => {
  it('should accept supported collection categories', () => {
    COLLECTION_CATEGORY_OPTIONS.forEach((category) => {
      expect(isCollectionCategory(category)).toBe(true);
    });
  });

  it('should reject unsupported values', () => {
    expect(isCollectionCategory('invalid')).toBe(false);
    expect(isCollectionCategory('')).toBe(false);
    expect(isCollectionCategory(undefined)).toBe(false);
    expect(isCollectionCategory(null)).toBe(false);
    expect(isCollectionCategory(42)).toBe(false);
  });
});

describe('isSuiteEvaluatesOption', () => {
  it('should accept supported evaluates options', () => {
    SUITE_EVALUATES_OPTIONS.forEach((option) => {
      expect(isSuiteEvaluatesOption(option)).toBe(true);
    });
  });

  it('should reject unsupported values', () => {
    expect(isSuiteEvaluatesOption('invalid')).toBe(false);
    expect(isSuiteEvaluatesOption('')).toBe(false);
    expect(isSuiteEvaluatesOption(undefined)).toBe(false);
    expect(isSuiteEvaluatesOption(null)).toBe(false);
    expect(isSuiteEvaluatesOption(42)).toBe(false);
  });
});
