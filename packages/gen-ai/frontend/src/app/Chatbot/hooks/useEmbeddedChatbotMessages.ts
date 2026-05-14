/* eslint-disable camelcase */
import * as React from 'react';
import type { MessageProps } from '@patternfly/chatbot';
import type { ResponsesTemplate } from '@odh-dashboard/plugin-core/types';
import userAvatar from '~/app/bgimages/user_avatar.svg';
import botAvatar from '~/app/bgimages/bot_avatar.svg';
import { getId } from '~/app/utilities/utils';
import { ChatMessageRole, ResponseMetrics } from '~/app/types';
import { createPassthroughResponse } from '~/app/services/llamaStackService';
import type { UseChatbotMessagesReturn, ChatbotMessageProps } from './useChatbotMessages';

interface UseEmbeddedChatbotMessagesProps {
  bffBasePath: string;
  namespace: string;
  secretName: string;
  responsesTemplate: ResponsesTemplate;
  username?: string;
}

/**
 * Embedded version of useChatbotMessages that uses the passthrough endpoint
 * instead of the standard createResponse endpoint. Manages conversation history
 * for multi-turn chat and handles streaming responses.
 *
 * Returns the same interface as useChatbotMessages so ChatbotPlayground
 * can use either interchangeably.
 */
const useEmbeddedChatbotMessages = ({
  bffBasePath,
  namespace,
  secretName,
  responsesTemplate,
  username,
}: UseEmbeddedChatbotMessagesProps): UseChatbotMessagesReturn => {
  const [messages, setMessages] = React.useState<ChatbotMessageProps[]>([]);
  const [isMessageSendButtonDisabled, setIsMessageSendButtonDisabled] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isStreamingWithoutContent, setIsStreamingWithoutContent] = React.useState(false);
  const [lastResponseMetrics, setLastResponseMetrics] = React.useState<ResponseMetrics | null>(
    null,
  );
  const scrollToBottomRef = React.useRef<HTMLDivElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const isStoppingStreamRef = React.useRef<boolean>(false);
  const isClearingRef = React.useRef<boolean>(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const isStreamingEnabled = responsesTemplate.stream;
  const modelDisplayName = responsesTemplate.model;

  // Cleanup on unmount
  React.useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    },
    [],
  );

  // Auto-scroll
  React.useEffect(() => {
    if (scrollToBottomRef.current) {
      scrollToBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleStopStreaming = React.useCallback(() => {
    if (abortControllerRef.current) {
      isStoppingStreamRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const clearConversation = React.useCallback(() => {
    isClearingRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages([]);
    setIsMessageSendButtonDisabled(false);
    setIsLoading(false);
    setIsStreamingWithoutContent(false);
    setLastResponseMetrics(null);
    isStoppingStreamRef.current = false;
    setTimeout(() => {
      isClearingRef.current = false;
    }, 0);
  }, []);

  const handleMessageSend = React.useCallback(
    async (message: string) => {
      const userMessage: MessageProps = {
        id: getId(),
        role: 'user',
        content: message,
        name: username || 'User',
        avatar: userAvatar,
        timestamp: new Date().toLocaleString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsMessageSendButtonDisabled(true);
      setIsLoading(true);

      if (isStreamingEnabled) {
        setIsStreamingWithoutContent(true);
      }

      let botMessageId: string | undefined;

      try {
        // Build chat history from existing messages
        const chatHistory = messages
          .map((msg) => ({
            role:
              msg.role === ChatMessageRole.USER ? ChatMessageRole.USER : ChatMessageRole.ASSISTANT,
            content: msg.content || '',
          }))
          .filter((msg) => msg.content);

        abortControllerRef.current = new AbortController();

        if (isStreamingEnabled) {
          botMessageId = getId();
          const streamingBotMessage: MessageProps = {
            id: botMessageId,
            role: 'bot',
            content: '',
            name: modelDisplayName,
            avatar: botAvatar,
            isLoading: true,
            timestamp: new Date().toLocaleString(),
          };
          setMessages((prevMessages) => [...prevMessages, streamingBotMessage]);

          const completeLines: string[] = [];
          let currentPartialLine = '';

          const updateMessage = (showPartialLine = true, hasContent = false) => {
            const displayContent =
              completeLines.join('\n') +
              (showPartialLine && currentPartialLine
                ? (completeLines.length > 0 ? '\n' : '') + currentPartialLine
                : '');

            setMessages((prevMessages) =>
              prevMessages.map((msg) =>
                msg.id === botMessageId
                  ? { ...msg, content: displayContent, isLoading: !hasContent }
                  : msg,
              ),
            );
          };

          const streamingResponse = await createPassthroughResponse(
            bffBasePath,
            namespace,
            secretName,
            { ...responsesTemplate },
            message,
            chatHistory,
            (chunk: string, clearPrevious?: boolean) => {
              if (clearPrevious) {
                completeLines.length = 0;
                currentPartialLine = '';
              }

              const hasAnyContent =
                completeLines.length > 0 || currentPartialLine.length > 0 || chunk.length > 0;

              if (chunk && isStreamingWithoutContent) {
                setIsStreamingWithoutContent(false);
              }

              currentPartialLine += chunk;
              const lines = currentPartialLine.split('\n');

              if (lines.length > 1) {
                completeLines.push(...lines.slice(0, -1));
                currentPartialLine = lines[lines.length - 1];
                updateMessage(true, hasAnyContent);
              } else {
                if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current);
                }
                if (!isStoppingStreamRef.current) {
                  timeoutRef.current = setTimeout(() => updateMessage(true, hasAnyContent), 50);
                }
              }
            },
            abortControllerRef.current.signal,
          );

          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }

          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === botMessageId
                ? { ...msg, content: streamingResponse.content, isLoading: false }
                : msg,
            ),
          );

          if (streamingResponse.metrics) {
            setLastResponseMetrics(streamingResponse.metrics);
          }
        } else {
          // Non-streaming
          const response = await createPassthroughResponse(
            bffBasePath,
            namespace,
            secretName,
            { ...responsesTemplate },
            message,
            chatHistory,
            undefined,
            abortControllerRef.current.signal,
          );

          const botMessage: ChatbotMessageProps = {
            id: getId(),
            role: 'bot',
            content: response.content || 'No response received',
            name: modelDisplayName,
            avatar: botAvatar,
            timestamp: new Date().toLocaleString(),
            ...(response.metrics && { metrics: response.metrics }),
          };
          setMessages((prevMessages) => [...prevMessages, botMessage]);
          if (response.metrics) {
            setLastResponseMetrics(response.metrics);
          }
        }
      } catch (error) {
        if (isClearingRef.current) {
          return;
        }

        const isAbortError =
          error instanceof Error &&
          (error.name === 'AbortError' ||
            error.message.includes('aborted') ||
            error.message === 'Response stopped by user');

        const wasUserStopped =
          isStoppingStreamRef.current &&
          (isAbortError ||
            (error instanceof Error && error.message === 'Response stopped by user'));

        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Sorry, I encountered an error while processing your request. Please try again.';

        if (isStreamingEnabled && botMessageId) {
          setMessages((prevMessages) =>
            prevMessages.map((msg) => {
              if (msg.id === botMessageId) {
                if (wasUserStopped) {
                  const stoppedContent = msg.content
                    ? `${msg.content}\n\n*You stopped this message*`
                    : '*You stopped this message*';
                  return { ...msg, content: stoppedContent, isLoading: false };
                }
                return { ...msg, content: errorMessage, isLoading: false };
              }
              return msg;
            }),
          );
        } else {
          const botErrorMessage: MessageProps = {
            id: getId(),
            role: 'bot',
            content: wasUserStopped ? '*You stopped this message*' : errorMessage,
            name: modelDisplayName,
            avatar: botAvatar,
            timestamp: new Date().toLocaleString(),
          };
          setMessages((prevMessages) => [...prevMessages, botErrorMessage]);
        }
      } finally {
        setIsMessageSendButtonDisabled(false);
        setIsLoading(false);
        setIsStreamingWithoutContent(false);
        isStoppingStreamRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [
      bffBasePath,
      namespace,
      secretName,
      responsesTemplate,
      username,
      messages,
      modelDisplayName,
      isStreamingEnabled,
      isStreamingWithoutContent,
    ],
  );

  return {
    messages,
    isMessageSendButtonDisabled,
    isLoading,
    isStreamingWithoutContent,
    handleMessageSend,
    handleStopStreaming,
    clearConversation,
    scrollToBottomRef,
    lastResponseMetrics,
    modelDisplayName,
  };
};

export default useEmbeddedChatbotMessages;
