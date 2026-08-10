import * as React from 'react';
import {
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
import { getSecrets } from '~/app/api/k8s';
import type { ConnectionValidationState } from '~/app/types';

type SourceAgentFieldsProps = {
  agentName: string;
  onAgentNameChange: (val: string) => void;
  endpointUrl: string;
  onEndpointUrlChange: (val: string) => void;
  onApiKeyChange: (val: string) => void;
  endpointUrlError: string | undefined;
  touched: Record<string, boolean>;
  markTouched: (field: string) => void;
  connectionValidation: ConnectionValidationState;
  canVerifyConnection: boolean;
  onVerifyConnection: () => void;
};

const SourceAgentFields: React.FC<SourceAgentFieldsProps> = ({
  agentName,
  onAgentNameChange,
  endpointUrl,
  onEndpointUrlChange,
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

  return (
    <Stack hasGutter>
      <StackItem>
        <FormGroup label="Agent name" isRequired fieldId="agent-name">
          <TextInput
            id="agent-name"
            data-testid="agent-name-input"
            value={agentName}
            onChange={(_e, val) => onAgentNameChange(val)}
            onBlur={() => markTouched('agentName')}
            isRequired
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>The agent name is case-sensitive.</HelperTextItem>
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
            onBlur={() => markTouched('endpointUrl')}
            placeholder="https://api.example.com/v1/agent"
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

export default SourceAgentFields;
