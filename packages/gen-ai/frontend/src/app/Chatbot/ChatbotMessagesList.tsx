import React from 'react';
import { Message } from '@patternfly/chatbot';
import { Stack, StackItem } from '@patternfly/react-core';
import botAvatar from '~/app/bgimages/bot_avatar.svg';
import { ChatbotMessageProps } from '~/app/Chatbot/hooks/useChatbotMessages';
import { ChatbotMessagesMetrics } from '~/app/Chatbot/ChatbotMessagesMetrics';
import ChatbotFileSearchResults from '~/app/Chatbot/ChatbotFileSearchResults';
import './ChatbotMessagesList.scss';

type ChatbotMessagesListProps = {
  messageList: ChatbotMessageProps[];
  scrollRef: React.RefObject<HTMLDivElement>;
  isLoading: boolean;
  isStreamingWithoutContent: boolean;
  /** Display name of the selected model (shown in loading state and message headers) */
  modelDisplayName?: string;
  /** Shown as a bot message when the conversation is empty and not loading */
  placeholderContent?: string;
};

const CITATION_REGEX = /\{\{citation:(\d+)\}\}/g;
const CITE_HREF_PREFIX = '#cite-';

const prepareCitationContent = (content: string): string =>
  content.replace(CITATION_REGEX, (_, num) => `[\\[${num}\\]](${CITE_HREF_PREFIX}${num})`);

const ChatbotMessagesList: React.FC<ChatbotMessagesListProps> = ({
  messageList,
  scrollRef,
  isLoading = false,
  isStreamingWithoutContent = false,
  modelDisplayName = 'Bot',
  placeholderContent,
}) => {
  const [expandedCitation, setExpandedCitation] = React.useState<{
    messageId: string;
    citationNumber: number;
  } | null>(null);

  // Show loading dots only when no message in the list is already showing its own loading state.
  const hasLoadingMessage = messageList.some((msg) => msg.isLoading);
  const showLoadingDots = isLoading && !isStreamingWithoutContent && !hasLoadingMessage;

  return (
    <>
      {messageList.length === 0 && !isLoading && placeholderContent && (
        <Message
          // eslint-disable-next-line jsx-a11y/aria-role
          role="bot"
          name={modelDisplayName}
          avatar={botAvatar}
          content={placeholderContent}
          data-testid="chatbot-placeholder-message"
          style={{ cursor: 'default', pointerEvents: 'none' }}
        />
      )}
      {messageList.map((message, index) => {
        // Destructure extended props to avoid passing them to PatternFly Message component
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { metrics, fileSearchData, annotations, citationMap, ...messageProps } = message;
        const hasCitations =
          message.role === 'bot' &&
          citationMap &&
          citationMap.size > 0 &&
          typeof message.content === 'string';

        // Build extraContent with file search results and metrics (for bot messages)
        const hasEndContent = message.role === 'bot' && (fileSearchData || metrics);
        const extraContent = hasEndContent
          ? {
              endContent: (
                <Stack hasGutter>
                  {fileSearchData && (
                    <StackItem>
                      <ChatbotFileSearchResults
                        fileSearchData={fileSearchData}
                        citationMap={citationMap}
                        expandedCitation={
                          expandedCitation !== null && expandedCitation.messageId === message.id
                            ? expandedCitation.citationNumber
                            : undefined
                        }
                        onCitationExpanded={() => setExpandedCitation(null)}
                      />
                    </StackItem>
                  )}
                  {metrics && (
                    <StackItem>
                      <ChatbotMessagesMetrics metrics={metrics} />
                    </StackItem>
                  )}
                </Stack>
              ),
            }
          : undefined;

        // For messages with citations, replace markers with markdown links and
        // intercept them via reactMarkdownProps to render as clickable buttons
        const citationProps = hasCitations
          ? {
              content: prepareCitationContent(String(message.content)),
              reactMarkdownProps: {
                components: {
                  a: ({
                    href,
                    children: linkChildren,
                    ...rest
                  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
                    if (href?.startsWith(CITE_HREF_PREFIX)) {
                      const num = parseInt(href.slice(CITE_HREF_PREFIX.length), 10);
                      return (
                        <button
                          type="button"
                          className="chatbot-citation-inline"
                          onClick={() =>
                            setExpandedCitation({
                              messageId: message.id ?? '',
                              citationNumber: num,
                            })
                          }
                          aria-label={`Citation ${String(num)}`}
                          data-testid={`citation-inline-${String(num)}`}
                        >
                          {linkChildren}
                        </button>
                      );
                    }
                    return (
                      <a href={href} {...rest}>
                        {linkChildren}
                      </a>
                    );
                  },
                },
              },
            }
          : undefined;

        return (
          <React.Fragment key={message.id}>
            <Message
              {...messageProps}
              {...citationProps}
              extraContent={extraContent}
              data-testid={`chatbot-message-${message.role}`}
            />
            {index === messageList.length - 1 && <div ref={scrollRef} />}
          </React.Fragment>
        );
      })}
      {showLoadingDots && (
        <Message
          name={modelDisplayName}
          // eslint-disable-next-line jsx-a11y/aria-role
          role="bot"
          avatar={botAvatar}
          isLoading
          data-testid="chatbot-message-bot"
        />
      )}
    </>
  );
};

const ChatbotMessages = React.memo(ChatbotMessagesList);

export { ChatbotMessages };
