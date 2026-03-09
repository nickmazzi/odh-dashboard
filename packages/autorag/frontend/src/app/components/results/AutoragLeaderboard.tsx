import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { Label } from '@patternfly/react-core';
import { StarIcon } from '@patternfly/react-icons';
import React from 'react';
import type { TaskDetail } from '~/app/types';

type AutoragLeaderboardProps = {
  taskDetails: TaskDetail[];
};

const AutoragLeaderboard: React.FC<AutoragLeaderboardProps> = ({ taskDetails }) => {
  // Filter tasks with display_name "autogluon-models-full-refit"
  const refitTasks = taskDetails.filter(
    (task) => task.display_name === 'autogluon-models-full-refit',
  );

  // Sort by index (assuming optimization metric will be equal to index for now)
  // and normalize pattern names to be sequential
  const rankedTasks = refitTasks.map((task, index) => ({
    task,
    rank: index + 1,
    patternName: `Pattern ${index + 1}`,
  }));

  const columnNames = {
    rank: 'Rank',
    patternName: 'Pattern name',
    modelName: 'Model name',
    answerFaithfulness: 'Answer faithfulness',
    chunkMethod: 'Chunk method',
    chunkSize: 'chunk size',
  };

  return (
    <Table aria-label="AutoRAG Leaderboard" variant="compact">
      <Thead>
        <Tr>
          <Th>{columnNames.rank}</Th>
          <Th>{columnNames.patternName}</Th>
          <Th>{columnNames.modelName}</Th>
          <Th>{columnNames.answerFaithfulness}</Th>
          <Th>{columnNames.chunkMethod}</Th>
          <Th>{columnNames.chunkSize}</Th>
          <Th />
        </Tr>
      </Thead>
      <Tbody>
        {rankedTasks.map(({ task, rank, patternName }) => (
          <Tr key={task.task_id}>
            <Td dataLabel={columnNames.rank}>
              {rank === 1 ? (
                <Label color="green" icon={<StarIcon />}>
                  {rank}
                </Label>
              ) : (
                rank
              )}
            </Td>
            <Td dataLabel={columnNames.patternName}>{patternName}</Td>
            <Td dataLabel={columnNames.modelName} />
            <Td dataLabel={columnNames.answerFaithfulness} />
            <Td dataLabel={columnNames.chunkMethod} />
            <Td dataLabel={columnNames.chunkSize} />
            <Td isActionCell>
              <ActionsColumn
                items={[
                  {
                    title: 'Save as notebook',
                    isDisabled: true,
                    onClick: () => {
                      // Placeholder for future implementation
                    },
                  },
                ]}
              />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

export default AutoragLeaderboard;
