import * as React from 'react';
import {
  Alert,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  TextInput,
  ValidatedOptions,
} from '@patternfly/react-core';
import type { APIOptions } from 'mod-arch-core';
import { useParams } from 'react-router-dom';
import SecretSelector from '@odh-dashboard/internal/concepts/secrets/SecretSelector/SecretSelector';
import type { SecretSelection } from '@odh-dashboard/internal/concepts/secrets/SecretSelector/types';
import LabelHelpPopover from '~/app/components/LabelHelpPopover';
import ConnectionValidationButton from '~/app/components/ConnectionValidationButton';
import { getSecrets, verifyConnection } from '~/app/api/k8s';
import { isValidUrl } from '~/app/utils/validationUtils';
import type { ConnectionValidationState, VerifyConnectionRequest } from '~/app/types';

type SourceModelFieldsProps = {
  modelName: string;
  onModelNameChange: (val: string) => void;
  endpointUrl: string;
  onEndpointUrlChange: (val: string) => void;
  apiKeySecretRef: string;
  onApiKeyChange: (val: string) => void;
  endpointUrlError: string | undefined;
  touched: Record<string, boolean>;
  markTouched: (field: string) => void;
  connectionValidation: ConnectionValidationState;
  canVerifyConnection: boolean;
  onVerifyConnection: () => void;
};

const SourceModelFields: React.FC<SourceModelFieldsProps> = ({
  modelName,
  onModelNameChange,
  endpointUrl,
  onEndpointUrlChange,
  apiKeySecretRef,
  onApiKeyChange,
  endpointUrlError,
  touched,
  markTouched,
  connectionValidation,
  canVerifyConnection,
  onVerifyConnection,
}) => {
  const { namespace } = useParams<{ namespace: string }>();
  const endpointUrlValidated =
    touched.endpointUrl && endpointUrlError ? ValidatedOptions.error : ValidatedOptions.default;

  const [compatWarning, setCompatWarning] = React.useState<string | undefined>(undefined);
  const compatAbortRef = React.useRef<AbortController | null>(null);
  const [selectedSecretUuid, setSelectedSecretUuid] = React.useState<string | undefined>();

  const fetchSecrets = React.useCallback(
    (opts: APIOptions) => getSecrets('')(namespace ?? '', 'model')(opts),
    [namespace],
  );

  const handleSecretChange = React.useCallback(
    (selection: SecretSelection | undefined) => {
      setSelectedSecretUuid(selection?.uuid);
      onApiKeyChange(selection?.name ?? '');
    },
    [onApiKeyChange],
  );

  React.useEffect(() => {
    setCompatWarning(undefined);
  }, [endpointUrl]);

  const handleEndpointBlur = React.useCallback(() => {
    markTouched('endpointUrl');

    const url = endpointUrl.trim();
    if (!namespace || !url || !isValidUrl(url)) {
      return;
    }

    compatAbortRef.current?.abort();
    const controller = new AbortController();
    compatAbortRef.current = controller;

    /* eslint-disable camelcase */
    const request: VerifyConnectionRequest = {
      source_type: 'model',
      base_url: url,
      ...(modelName.trim() ? { model_id: modelName.trim() } : {}),
      ...(apiKeySecretRef.trim() ? { secret_name: apiKeySecretRef.trim() } : {}),
    };
    /* eslint-enable camelcase */

    verifyConnection(
      '',
      namespace,
      request,
    )({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted && result.openai_compatible === false) {
          setCompatWarning(
            'This endpoint does not appear to be OpenAI-compatible. Evaluation benchmarks may fail.',
          );
        }
      })
      .catch(() => {
        // Connection errors are handled by the existing validate button flow
      });
  }, [endpointUrl, namespace, modelName, apiKeySecretRef, markTouched]);

  React.useEffect(
    () => () => {
      compatAbortRef.current?.abort();
    },
    [],
  );

  return (
    <Stack hasGutter>
      <StackItem>
        <Alert
          variant="info"
          isInline
          isPlain
          title="This model must expose an OpenAI-compatible chat/completions endpoint."
          data-testid="external-endpoint-compatibility-alert"
        />
      </StackItem>
      <StackItem>
        <FormGroup
          label="Model name"
          isRequired
          fieldId="model-name"
          labelHelp={
            <LabelHelpPopover
              ariaLabel="More info for model name"
              content="The model identifier used by the inference endpoint. This must match the model name configured on the server."
            />
          }
        >
          <TextInput
            id="model-name"
            data-testid="model-name-input"
            value={modelName}
            onChange={(_e, val) => onModelNameChange(val)}
            onBlur={() => markTouched('modelName')}
            isRequired
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>The model name is case-sensitive.</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Endpoint URL" isRequired fieldId="endpoint-url">
          <TextInput
            id="endpoint-url"
            data-testid="endpoint-url-input"
            value={endpointUrl}
            onChange={(_e, val) => onEndpointUrlChange(val)}
            onBlur={handleEndpointBlur}
            placeholder="https://api.example.com/v1/model"
            isRequired
            validated={endpointUrlValidated}
          />
          {touched.endpointUrl && endpointUrlError ? (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="error">{endpointUrlError}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          ) : null}
          {compatWarning && !endpointUrlError ? (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="warning" data-testid="openai-compat-warning">
                  {compatWarning}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          ) : null}
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup
          label="Authentication secret"
          fieldId="api-key"
          labelHelp={
            <LabelHelpPopover
              ariaLabel="More info for authentication secret"
              title="Authentication secret"
              content={
                <>
                  Select a Kubernetes Secret that stores authentication credentials. The secret must
                  contain an API key (api-key). For gated Hugging Face models, it should also
                  include a Hugging Face token (hf-token).
                  <br />
                  <br />
                  If it hasn&apos;t been created yet, run:
                  <pre
                    style={{
                      background: 'var(--pf-t--global--background--color--secondary--default)',
                      padding: 'var(--pf-t--global--spacer--sm)',
                      borderRadius: 'var(--pf-t--global--border--radius--small)',
                      marginTop: 'var(--pf-t--global--spacer--sm)',
                      whiteSpace: 'pre',
                      overflowX: 'auto',
                    }}
                  >
                    {`oc create secret generic my-api-secret\n  --from-file=api-key=./api-key.txt\n  --from-literal=hf-token=<your-token>\n  -n ${namespace ?? 'your-namespace'}`}
                  </pre>
                </>
              }
            />
          }
        >
          <SecretSelector
            fetchSecrets={fetchSecrets}
            value={selectedSecretUuid}
            onChange={handleSecretChange}
            placeholder="Select a secret"
            dataTestId="api-key-secret-selector"
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <ConnectionValidationButton
          connectionValidation={connectionValidation}
          canVerify={canVerifyConnection}
          onVerify={onVerifyConnection}
          isValidating={connectionValidation.status === 'validating'}
        />
      </StackItem>
    </Stack>
  );
};

export default SourceModelFields;
