import React from 'react';
import type { ResponsesTemplate } from '@odh-dashboard/plugin-core/types';

type EmbeddedMessagesConfig = {
  bffBasePath: string;
  namespace: string;
  secretName: string;
  responsesTemplate: ResponsesTemplate;
};

const EmbeddedMessagesContext = React.createContext<EmbeddedMessagesConfig | null>(null);

export const useEmbeddedMessagesConfig = (): EmbeddedMessagesConfig | null =>
  React.useContext(EmbeddedMessagesContext);

export default EmbeddedMessagesContext;
