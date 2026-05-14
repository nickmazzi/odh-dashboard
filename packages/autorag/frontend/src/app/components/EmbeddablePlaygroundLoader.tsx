import React from 'react';
import { loadRemote } from '@module-federation/runtime';
import type { EmbeddableChatbotPlaygroundProps } from '@odh-dashboard/plugin-core/types';

export const EmbeddableChatbotPlayground = React.lazy(() =>
  loadRemote<{ default: React.ComponentType<EmbeddableChatbotPlaygroundProps> }>(
    'genAi/EmbeddableChatbotPlayground',
  )
    .then((mod) => mod ?? { default: () => null })
    .catch(() => ({ default: () => null })),
);
