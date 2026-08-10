import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import useFetchState from '@odh-dashboard/ui-core/hooks/useFetchState';
import type { SecretListItem } from '#~/concepts/secrets/SecretSelector/types';
import SecretSelector from '#~/concepts/secrets/SecretSelector/SecretSelector';

jest.mock('@odh-dashboard/ui-core/hooks/useFetchState', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@odh-dashboard/ui-core/components/TypeaheadSelect', () => {
  const ReactActual = jest.requireActual('react');
  const MockTypeaheadSelect = ({
    selectOptions,
    selected,
    onSelect,
    placeholder,
    dataTestId,
    isDisabled,
    toggleProps,
  }: {
    selectOptions: {
      content: string | number;
      value: string | number;
      description?: React.ReactNode;
    }[];
    selected?: string | number;
    onSelect?: (event: undefined, value: string | number) => void;
    placeholder?: string;
    dataTestId?: string;
    isDisabled?: boolean;
    toggleProps?: { status?: string };
  }) => {
    const [isOpen, setIsOpen] = ReactActual.useState(false);
    const selectedOption = selectOptions.find(
      (opt: { value: string | number }) => opt.value === selected,
    );
    const displayText = selectedOption?.content || placeholder;
    return ReactActual.createElement(
      'div',
      {},
      ReactActual.createElement(
        'button',
        {
          type: 'button',
          className: `pf-v6-c-menu-toggle ${toggleProps?.status === 'danger' ? 'pf-m-danger' : ''}`,
          'data-testid': dataTestId,
          disabled: isDisabled,
          onClick: () => !isDisabled && setIsOpen(!isOpen),
        },
        displayText,
      ),
      ReactActual.createElement('button', {
        type: 'button',
        'data-testid': dataTestId ? `${dataTestId}-trigger-invalid` : undefined,
        onClick: () => onSelect?.(undefined, 'test-invalid-selection-value'),
        style: { display: 'none' },
      }),
      isOpen &&
        !isDisabled &&
        ReactActual.createElement(
          'ul',
          { role: 'listbox' },
          selectOptions.map(
            (option: {
              content: string | number;
              value: string | number;
              description?: React.ReactNode;
            }) =>
              ReactActual.createElement(
                'li',
                {
                  key: option.value,
                  role: 'option',
                  onClick: () => {
                    onSelect?.(undefined, option.value);
                    setIsOpen(false);
                  },
                },
                option.content,
                option.description && ReactActual.createElement('div', null, option.description),
              ),
          ),
        ),
    );
  };
  return { __esModule: true, default: MockTypeaheadSelect };
});

const mockUseFetchState = jest.mocked(useFetchState);

const mockSecretListItem = ({
  uuid = 'secret-uuid-123',
  name = 'test-secret',
  type,
  data = {
    AWS_ACCESS_KEY_ID: '[REDACTED]',
    AWS_SECRET_ACCESS_KEY: '[REDACTED]',
    AWS_DEFAULT_REGION: '[REDACTED]',
    AWS_S3_ENDPOINT: '[REDACTED]',
  },
  displayName,
  description,
}: Partial<SecretListItem> = {}): SecretListItem => ({
  uuid,
  name,
  ...(type && { type }),
  data,
  ...(displayName && { displayName }),
  ...(description && { description }),
});

const mockStorageSecret = (overrides: Partial<SecretListItem> = {}): SecretListItem =>
  mockSecretListItem({
    type: 's3',
    data: {
      AWS_ACCESS_KEY_ID: '[REDACTED]',
      AWS_SECRET_ACCESS_KEY: '[REDACTED]',
      AWS_DEFAULT_REGION: '[REDACTED]',
      AWS_S3_ENDPOINT: '[REDACTED]',
    },
    ...overrides,
  });

describe('SecretSelector', () => {
  const mockOnChange = jest.fn();
  const mockRefresh = jest.fn();
  const mockFetchSecrets = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('loading state', () => {
    it('should show skeleton when loading', () => {
      mockUseFetchState.mockReturnValue([[], false, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      const skeleton = document.querySelector('.pf-v6-c-skeleton');
      expect(skeleton).toBeInTheDocument();
    });
  });

  describe('success state with secrets', () => {
    const mockSecrets: SecretListItem[] = [
      mockStorageSecret({ uuid: '1', name: 'aws-secret-1' }),
      mockStorageSecret({ uuid: '2', name: 'aws-secret-2' }),
    ];

    it('should render dropdown with secrets when loaded', () => {
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      const toggle = screen.getByTestId('test-selector');
      expect(toggle).toBeInTheDocument();
      expect(toggle).not.toBeDisabled();
      expect(toggle).toHaveTextContent('Select a secret');
    });

    it('should render custom placeholder', () => {
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          placeholder="Pick your secret"
          dataTestId="test-selector"
        />,
      );

      const toggle = screen.getByTestId('test-selector');
      expect(toggle).toHaveTextContent('Pick your secret');
    });

    it('should show selected secret name', () => {
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value="2"
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      expect(screen.getByTestId('test-selector')).toHaveTextContent('aws-secret-2');
    });

    it('should open dropdown on click and show secrets', () => {
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      fireEvent.click(screen.getByTestId('test-selector'));

      expect(screen.getByText('aws-secret-1')).toBeInTheDocument();
      expect(screen.getByText('aws-secret-2')).toBeInTheDocument();
    });

    it('should not display type labels by default', () => {
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      fireEvent.click(screen.getByTestId('test-selector'));

      expect(screen.queryByText('Type: s3')).not.toBeInTheDocument();
    });

    it('should display secret type when showType is true', () => {
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          showType
          dataTestId="test-selector"
        />,
      );

      fireEvent.click(screen.getByTestId('test-selector'));

      expect(screen.getAllByText('Type: s3')).toHaveLength(2);
    });

    it('should call onChange with secret data when selected', () => {
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      fireEvent.click(screen.getByTestId('test-selector'));
      fireEvent.click(screen.getByText('aws-secret-2'));

      expect(mockOnChange).toHaveBeenCalledWith({
        uuid: '2',
        name: 'aws-secret-2',
        type: 's3',
        data: {
          AWS_ACCESS_KEY_ID: '[REDACTED]',
          AWS_SECRET_ACCESS_KEY: '[REDACTED]',
          AWS_DEFAULT_REGION: '[REDACTED]',
          AWS_S3_ENDPOINT: '[REDACTED]',
        },
        invalid: false,
      });
    });

    it('should close dropdown after selection', () => {
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      fireEvent.click(screen.getByTestId('test-selector'));
      expect(screen.getByText('aws-secret-1')).toBeInTheDocument();

      fireEvent.click(screen.getByText('aws-secret-1'));

      expect(screen.queryByText('aws-secret-2')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should disable dropdown when no secrets available', () => {
      mockUseFetchState.mockReturnValue([[], true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      const toggle = screen.getByTestId('test-selector');
      expect(toggle).toBeDisabled();
    });
  });

  describe('error state', () => {
    const mockError = new Error('Failed to fetch secrets');

    it('should disable dropdown when error occurs', () => {
      mockUseFetchState.mockReturnValue([[], true, mockError, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      expect(screen.getByTestId('test-selector')).toBeDisabled();
    });

    it('should show error message below dropdown', () => {
      mockUseFetchState.mockReturnValue([[], true, mockError, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      expect(screen.getByText('Secrets could not be fetched')).toBeInTheDocument();
    });

    it('should show danger status on toggle when error occurs', () => {
      mockUseFetchState.mockReturnValue([[], true, mockError, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      expect(screen.getByTestId('test-selector')).toHaveClass('pf-m-danger');
    });
  });

  describe('disabled state', () => {
    it('should be disabled when isDisabled prop is true', () => {
      mockUseFetchState.mockReturnValue([[mockStorageSecret()], true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          isDisabled
          dataTestId="test-selector"
        />,
      );

      expect(screen.getByTestId('test-selector')).toBeDisabled();
    });
  });

  describe('additional required keys validation', () => {
    it('should show error when selected secret is missing required keys', () => {
      const mockSecrets: SecretListItem[] = [
        mockStorageSecret({
          uuid: '1',
          name: 'incomplete-secret',
          data: {
            AWS_ACCESS_KEY_ID: '[REDACTED]',
            AWS_SECRET_ACCESS_KEY: '[REDACTED]',
            AWS_DEFAULT_REGION: '[REDACTED]',
          },
        }),
      ];
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          additionalRequiredKeys={{ s3: ['AWS_S3_BUCKET'] }}
          dataTestId="test-selector"
        />,
      );

      fireEvent.click(screen.getByTestId('test-selector'));
      fireEvent.click(screen.getByText('incomplete-secret'));

      expect(
        screen.getByText('Required key "AWS_S3_BUCKET" is not set in this secret'),
      ).toBeInTheDocument();

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          uuid: '1',
          name: 'incomplete-secret',
          invalid: true,
        }),
      );
    });

    it('should allow selection when secret has all required keys', () => {
      const mockSecrets: SecretListItem[] = [
        mockStorageSecret({
          uuid: '1',
          name: 'complete-secret',
          data: {
            AWS_ACCESS_KEY_ID: '[REDACTED]',
            AWS_SECRET_ACCESS_KEY: '[REDACTED]',
            AWS_DEFAULT_REGION: '[REDACTED]',
            AWS_S3_ENDPOINT: '[REDACTED]',
            AWS_S3_BUCKET: 'my-bucket',
          },
        }),
      ];
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          additionalRequiredKeys={{ s3: ['AWS_S3_BUCKET'] }}
          dataTestId="test-selector"
        />,
      );

      fireEvent.click(screen.getByTestId('test-selector'));
      fireEvent.click(screen.getByText('complete-secret'));

      expect(
        screen.queryByText('Required key "AWS_S3_BUCKET" is not set in this secret'),
      ).not.toBeInTheDocument();

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          uuid: '1',
          name: 'complete-secret',
          invalid: false,
        }),
      );
    });

    it('should not validate when no additionalRequiredKeys prop provided', () => {
      const mockSecrets: SecretListItem[] = [
        mockStorageSecret({
          uuid: '1',
          name: 'any-secret',
          data: { AWS_ACCESS_KEY_ID: '[REDACTED]' },
        }),
      ];
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      fireEvent.click(screen.getByTestId('test-selector'));
      fireEvent.click(screen.getByText('any-secret'));

      expect(screen.queryByText(/Required key/)).not.toBeInTheDocument();
      expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ invalid: false }));
    });
  });

  describe('display name', () => {
    it('should display displayName when available', () => {
      const mockSecrets: SecretListItem[] = [
        mockStorageSecret({
          uuid: '1',
          name: 'aws-prod-credentials',
          displayName: 'Production AWS Credentials',
        }),
      ];
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value="1"
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      expect(screen.getByTestId('test-selector')).toHaveTextContent('Production AWS Credentials');
    });

    it('should fallback to name when displayName is not available', () => {
      const mockSecrets: SecretListItem[] = [
        mockStorageSecret({ uuid: '1', name: 'aws-prod-credentials' }),
      ];
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value="1"
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      expect(screen.getByTestId('test-selector')).toHaveTextContent('aws-prod-credentials');
    });
  });

  describe('description', () => {
    it('should display type and description when both are available', () => {
      const mockSecrets: SecretListItem[] = [
        mockStorageSecret({
          uuid: '1',
          name: 'aws-prod-credentials',
          description: 'Production S3 bucket for data storage',
        }),
      ];
      mockUseFetchState.mockReturnValue([mockSecrets, true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          showType
          showDescription
          dataTestId="test-selector"
        />,
      );

      fireEvent.click(screen.getByTestId('test-selector'));

      expect(screen.getByText('Type: s3')).toBeInTheDocument();
      expect(screen.getByText('Production S3 bucket for data storage')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined value gracefully', () => {
      mockUseFetchState.mockReturnValue([[mockStorageSecret()], true, undefined, mockRefresh]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      expect(screen.getByTestId('test-selector')).toHaveTextContent('Select a secret');
    });

    it('should call onChange with undefined for non-existent selection', () => {
      mockUseFetchState.mockReturnValue([
        [mockStorageSecret({ uuid: '1', name: 'secret-1' })],
        true,
        undefined,
        mockRefresh,
      ]);

      render(
        <SecretSelector
          fetchSecrets={mockFetchSecrets}
          value={undefined}
          onChange={mockOnChange}
          dataTestId="test-selector"
        />,
      );

      const triggerInvalidButton = screen.getByTestId('test-selector-trigger-invalid');
      fireEvent.click(triggerInvalidButton);

      expect(mockOnChange).toHaveBeenCalledWith(undefined);
    });
  });
});
