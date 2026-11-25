import * as React from 'react';
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Flex,
  FlexItem,
  Skeleton,
} from '@patternfly/react-core';
import './BenchmarkCard.scss';

const BenchmarkCardSkeleton: React.FC = () => (
  <Card
    className="evalhub-benchmark-card evalhub-benchmark-card--loading"
    isFullHeight
    data-testid="benchmark-card-loading"
    aria-busy="true"
  >
    <CardHeader>
      <Skeleton width="7rem" height="1.5rem" aria-hidden="true" />
    </CardHeader>
    <CardTitle>
      <Skeleton width="85%" height="1.5rem" aria-hidden="true" />
      <div className="evalhub-benchmark-card__loading-subtitle" aria-hidden="true">
        <Skeleton width="45%" />
      </div>
    </CardTitle>
    <CardBody>
      <div className="evalhub-benchmark-card__loading-description" aria-hidden="true">
        <Skeleton width="100%" />
        <Skeleton width="95%" />
        <Skeleton width="88%" />
        <Skeleton width="72%" />
      </div>
      <Flex gap={{ default: 'gapSm' }} className="pf-v6-u-mt-md" aria-hidden="true">
        <FlexItem>
          <Skeleton width="4.5rem" height="1.5rem" />
        </FlexItem>
        <FlexItem>
          <Skeleton width="5rem" height="1.5rem" />
        </FlexItem>
      </Flex>
    </CardBody>
    <CardFooter>
      <Skeleton width="8.5rem" height="2.25rem" aria-hidden="true" />
    </CardFooter>
  </Card>
);

export default BenchmarkCardSkeleton;
