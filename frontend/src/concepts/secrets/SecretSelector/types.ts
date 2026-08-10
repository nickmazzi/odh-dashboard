import type { K8sAPIOptions } from '@odh-dashboard/k8s-core';

export type SecretListItem = {
  uuid: string;
  name: string;
  type?: string;
  data?: Record<string, string>;
  displayName?: string;
  description?: string;
};

export interface SecretSelection extends SecretListItem {
  invalid?: boolean;
}

export type FetchSecretsCallback = (opts: K8sAPIOptions) => Promise<SecretListItem[]>;
