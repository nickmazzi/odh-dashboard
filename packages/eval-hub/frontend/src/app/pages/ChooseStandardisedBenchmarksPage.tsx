import * as React from 'react';
import { BreadcrumbItem, PageSection } from '@patternfly/react-core';
import { useParams } from 'react-router-dom';
import { ApplicationsPage } from '@odh-dashboard/ui-core';
import ContextBreadcrumb from '~/app/components/ContextBreadcrumb';
import BenchmarkCatalog from '~/app/components/BenchmarkCatalog';
import { useProjectDisplayName } from '~/app/hooks/useProjectDisplayName';
import { evaluationsBaseRoute, projectHomeRoute } from '~/app/routes';

const ChooseStandardisedBenchmarksPage: React.FC = () => {
  const { namespace } = useParams<{ namespace: string }>();
  const projectDisplayName = useProjectDisplayName(namespace);

  return (
    <ApplicationsPage
      title="Select benchmark"
      description="Select a benchmark to run on your model, agent, or dataset."
      breadcrumb={
        <ContextBreadcrumb
          pageName="Evaluations"
          projectDisplayName={projectDisplayName}
          homePath={evaluationsBaseRoute(namespace)}
          projectHomePath={projectHomeRoute(namespace)}
        >
          <BreadcrumbItem isActive>Select benchmark</BreadcrumbItem>
        </ContextBreadcrumb>
      }
      loaded
      empty={false}
    >
      <PageSection hasBodyWrapper={false} isFilled>
        <BenchmarkCatalog namespace={namespace ?? ''} />
      </PageSection>
    </ApplicationsPage>
  );
};

export default ChooseStandardisedBenchmarksPage;
