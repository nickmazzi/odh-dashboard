import {
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  Skeleton,
} from '@patternfly/react-core';
import { ExclamationCircleIcon } from '@patternfly/react-icons';
import useFetchState from '@odh-dashboard/ui-core/hooks/useFetchState';
import TypeaheadSelect from '@odh-dashboard/ui-core/components/TypeaheadSelect';
import type {
  TypeaheadSelectOption,
  TypeaheadSelectProps,
} from '@odh-dashboard/ui-core/components/TypeaheadSelect';
import * as React from 'react';
import type { FetchSecretsCallback, SecretListItem, SecretSelection } from './types';
import { formatMissingKeysMessage, getMissingRequiredKeys } from './secretValidation';

type SecretSelectorProps = Omit<
  TypeaheadSelectProps,
  'selectOptions' | 'selected' | 'onSelect' | 'onChange'
> & {
  fetchSecrets: FetchSecretsCallback;
  value?: string;
  onChange: (selection: SecretSelection | undefined) => void;
  /**
   * Additional keys that must be present in the secret for this specific use case.
   * These are beyond the keys required for secret type classification (handled by the BFF).
   *
   * @example
   * additionalRequiredKeys={{ s3: ['AWS_S3_BUCKET'] }}
   */
  additionalRequiredKeys?: Readonly<Partial<Record<string, readonly string[]>>>;
  /**
   * Called with the refresh function so the parent can trigger a secrets list refresh
   * (e.g. after creating a new connection). Refresh returns the updated list.
   */
  onRefreshReady?: (refresh: () => Promise<SecretListItem[] | undefined>) => void;
  showDescription?: boolean;
  showType?: boolean;
};

const SecretSelector: React.FC<SecretSelectorProps> = ({
  fetchSecrets,
  value,
  onChange,
  placeholder = 'Select a secret',
  isDisabled = false,
  isRequired = false,
  previewDescription = false,
  toggleWidth = '100%',
  dataTestId = 'secret-selector',
  additionalRequiredKeys,
  onRefreshReady,
  showDescription = false,
  showType = false,
  toggleProps: userToggleProps,
  ...props
}) => {
  const [validationError, setValidationError] = React.useState<string>('');

  const [secrets, loaded, error, refresh] = useFetchState<SecretListItem[]>(fetchSecrets, []);

  React.useEffect(() => {
    onRefreshReady?.(refresh);
  }, [refresh, onRefreshReady]);

  const secretsList = React.useMemo(() => (Array.isArray(secrets) ? secrets : []), [secrets]);
  const hasSecrets = secretsList.length > 0;
  const hasError = !!error;
  const isLoading = !loaded;
  const hasNoSecrets = loaded && !hasError && !hasSecrets;
  const isSelectDisabled = isDisabled || hasError || !hasSecrets || isLoading;

  const validateSecretKeys = React.useCallback(
    (secret: SecretListItem): string[] => {
      if (!additionalRequiredKeys || !secret.type) {
        return [];
      }

      const requiredKeysForType = additionalRequiredKeys[secret.type];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!requiredKeysForType) {
        return [];
      }

      return getMissingRequiredKeys(requiredKeysForType, Object.keys(secret.data ?? {}));
    },
    [additionalRequiredKeys],
  );

  React.useEffect(() => {
    if (!value) {
      setValidationError('');
      return;
    }

    if (secretsList.length === 0) {
      setValidationError('');
      return;
    }

    const secret = secretsList.find((s) => s.uuid === value);
    if (!secret) {
      setValidationError('');
      return;
    }
    const missingKeys = validateSecretKeys(secret);
    if (missingKeys.length > 0) {
      setValidationError(formatMissingKeysMessage(missingKeys));
    } else {
      setValidationError('');
    }
  }, [value, secretsList, validateSecretKeys, onChange]);

  React.useEffect(() => {
    if (!loaded || error || !value) {
      return;
    }
    if (secretsList.length === 0) {
      onChange(undefined);
      return;
    }
    const isValueInList = secretsList.some((secret) => secret.uuid === value);
    if (!isValueInList) {
      onChange(undefined);
    }
  }, [loaded, error, secretsList, value, onChange]);

  const options: TypeaheadSelectOption[] = React.useMemo(
    () =>
      secretsList.map((secret) => {
        const labels = [];
        if (showType && secret.type) {
          labels.push(
            <Label key="type" color="teal" isCompact>
              Type: {secret.type}
            </Label>,
          );
        }
        if (showDescription && secret.description) {
          labels.push(
            <div
              key="desc"
              className="pf-v6-u-text-truncate"
              style={{ width: '250px' }}
              title={secret.description}
            >
              {secret.description}
            </div>,
          );
        }

        return {
          content: secret.displayName || secret.name,
          value: secret.uuid,
          isSelected: secret.uuid === value,
          description: labels.length ? (
            <LabelGroup className="pf-v6-u-mt-sm">{labels}</LabelGroup>
          ) : undefined,
        };
      }),
    [secretsList, value, showDescription, showType],
  );

  if (isLoading) {
    return <Skeleton />;
  }

  return (
    <>
      <TypeaheadSelect
        {...props}
        placeholder={placeholder}
        selectOptions={options}
        selected={value}
        dataTestId={dataTestId}
        isDisabled={isSelectDisabled}
        isRequired={isRequired}
        previewDescription={previewDescription}
        toggleWidth={toggleWidth}
        toggleProps={{
          ...userToggleProps,
          status: hasError ? 'danger' : userToggleProps?.status,
        }}
        onSelect={(
          _:
            | React.MouseEvent<Element, MouseEvent>
            | React.KeyboardEvent<HTMLInputElement>
            | undefined,
          selection: string | number,
        ) => {
          const uuid = String(selection);
          const secret = secretsList.find((s) => s.uuid === uuid);

          if (secret) {
            const missingKeys = validateSecretKeys(secret);

            if (missingKeys.length > 0) {
              setValidationError(formatMissingKeysMessage(missingKeys));
              onChange({ ...secret, invalid: true });
            } else {
              setValidationError('');
              onChange({ ...secret, invalid: false });
            }
          } else {
            setValidationError('');
            onChange(undefined);
          }
        }}
      />
      {(hasError || hasNoSecrets || validationError) && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem
              variant={hasError || validationError ? 'error' : 'indeterminate'}
              icon={hasError || validationError ? <ExclamationCircleIcon /> : undefined}
            >
              {validationError ||
                (hasError
                  ? 'Secrets could not be fetched'
                  : 'There are no secrets in the selected namespace')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </>
  );
};

export default SecretSelector;
