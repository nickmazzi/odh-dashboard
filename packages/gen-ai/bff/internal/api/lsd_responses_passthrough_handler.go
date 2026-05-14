package api

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"
	"github.com/opendatahub-io/gen-ai/internal/constants"
	helper "github.com/opendatahub-io/gen-ai/internal/helpers"
)

// LlamaStackPassthroughResponseHandler handles POST /api/v1/lsd/responses/passthrough
//
// This endpoint accepts a pre-built LlamaStack Responses API template body and forwards
// it directly to the LlamaStack instance referenced by a Kubernetes secret. The body is
// forwarded as-is with two enforced overrides:
//   - stream is forced to true (non-streaming is not yet supported)
//   - store must not be true (stored responses are not supported in passthrough mode)
//
// Query parameters:
//   - namespace: target namespace (set by AttachNamespace middleware)
//   - secretName: K8s secret with LlamaStack credentials (set by AttachLlamaStackClientFromSecret)
func (app *App) LlamaStackPassthroughResponseHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	ctx := r.Context()
	logger := helper.GetContextLoggerFromReq(r)

	// Read the raw request body
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		app.badRequestResponse(w, r, fmt.Errorf("failed to read request body: %w", err))
		return
	}
	defer r.Body.Close()

	if len(bodyBytes) == 0 {
		app.badRequestResponse(w, r, fmt.Errorf("request body is required"))
		return
	}

	// Parse body as generic JSON to validate and modify fields
	var body map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &body); err != nil {
		app.badRequestResponse(w, r, fmt.Errorf("invalid JSON body: %w", err))
		return
	}

	// Validate store field: reject if store is explicitly true
	if storeVal, ok := body["store"]; ok {
		if storeBool, isBool := storeVal.(bool); isBool && storeBool {
			app.badRequestResponse(w, r, fmt.Errorf("store: true is not supported in passthrough mode"))
			return
		}
	}

	// Force stream to true
	// TODO: Add non-streaming support for passthrough endpoint
	body["stream"] = true

	// Re-marshal the modified body
	modifiedBody, err := json.Marshal(body)
	if err != nil {
		app.serverErrorResponse(w, r, fmt.Errorf("failed to marshal modified body: %w", err))
		return
	}

	// Get connection info from context (set by AttachLlamaStackClientFromSecret middleware)
	baseURL, _ := ctx.Value(constants.LlamaStackBaseURLKey).(string)
	apiKey, _ := ctx.Value(constants.LlamaStackAPIKeyCtxKey).(string)

	// In mock mode, baseURL will be empty — use the client from context instead
	if app.config.MockLSClient {
		logger.Debug("MOCK MODE: passthrough using mock LlamaStack client")
		// In mock mode, fall back to the standard streaming handler via the SDK client
		// For now, return a simple mock response
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache, no-transform")
		w.Header().Set("Connection", "keep-alive")
		mockEvent := map[string]interface{}{
			"type": "response.completed",
			"response": map[string]interface{}{
				"id":     "mock-passthrough-response",
				"status": "completed",
				"model":  "mock-model",
			},
		}
		eventData, _ := json.Marshal(mockEvent)
		fmt.Fprintf(w, "data: %s\n\n", eventData)
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
		return
	}

	if baseURL == "" {
		app.serverErrorResponse(w, r, fmt.Errorf("LlamaStack base URL not available in context"))
		return
	}

	// Build the upstream LlamaStack responses endpoint URL
	upstreamURL := strings.TrimSuffix(baseURL, "/") + "/v1/responses"

	logger.Debug("Forwarding passthrough request to LlamaStack",
		"upstreamURL", upstreamURL,
		"bodySize", len(modifiedBody))

	// Create upstream request
	upstreamReq, err := http.NewRequestWithContext(ctx, http.MethodPost, upstreamURL, bytes.NewReader(modifiedBody))
	if err != nil {
		app.serverErrorResponse(w, r, fmt.Errorf("failed to create upstream request: %w", err))
		return
	}
	upstreamReq.Header.Set("Content-Type", "application/json")
	upstreamReq.Header.Set("Accept", "text/event-stream")
	if apiKey != "" {
		upstreamReq.Header.Set("Authorization", "Bearer "+apiKey)
	}

	// Create HTTP client with appropriate TLS config
	tlsConfig := &tls.Config{InsecureSkipVerify: app.config.InsecureSkipVerify}
	if app.rootCAs != nil {
		tlsConfig.RootCAs = app.rootCAs
	}
	httpClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: tlsConfig,
		},
		Timeout: 8 * time.Minute,
	}

	// Execute upstream request
	upstreamResp, err := httpClient.Do(upstreamReq)
	if err != nil {
		logger.Error("Failed to connect to upstream LlamaStack", "error", err, "url", upstreamURL)
		app.serverErrorResponse(w, r, fmt.Errorf("failed to connect to LlamaStack: %w", err))
		return
	}
	defer upstreamResp.Body.Close()

	// If upstream returned an error, forward it
	if upstreamResp.StatusCode != http.StatusOK && upstreamResp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(upstreamResp.Body)
		logger.Error("Upstream LlamaStack returned error",
			"status", upstreamResp.StatusCode,
			"body", string(respBody))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(upstreamResp.StatusCode)
		w.Write(respBody)
		return
	}

	// Stream SSE response back to client
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported by client", http.StatusNotImplemented)
		return
	}

	// Track metrics
	startTime := time.Now()
	var firstTokenTime *time.Time
	var usage *UsageData

	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	// Read and forward SSE events from upstream, transforming to our clean schema
	scanner := bufio.NewScanner(upstreamResp.Body)
	// Increase scanner buffer for large SSE events
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		// Check if client disconnected
		select {
		case <-ctx.Done():
			logger.Info("Client disconnected during passthrough streaming")
			return
		default:
		}

		line := scanner.Text()

		// SSE format: "data: <json>"
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		eventJSON := strings.TrimPrefix(line, "data: ")
		if eventJSON == "[DONE]" {
			break
		}

		// Parse and transform through our clean event schema
		var rawEvent interface{}
		if err := json.Unmarshal([]byte(eventJSON), &rawEvent); err != nil {
			logger.Debug("Skipping unparseable SSE event", "error", err)
			continue
		}

		streamingEvent := convertToStreamingEvent(rawEvent)
		if streamingEvent == nil {
			continue
		}

		// Track TTFT on first text delta
		if streamingEvent.Type == "response.output_text.delta" && firstTokenTime == nil {
			now := time.Now()
			firstTokenTime = &now
		}

		// Extract usage from completed event
		if streamingEvent.Type == "response.completed" {
			usage = extractUsageFromEvent(rawEvent)
		}

		// Marshal clean event and write SSE
		cleanJSON, err := json.Marshal(streamingEvent)
		if err != nil {
			logger.Error("Failed to marshal streaming event", "error", err)
			continue
		}

		fmt.Fprintf(w, "data: %s\n\n", cleanJSON)
		flusher.Flush()
	}

	if err := scanner.Err(); err != nil {
		logger.Error("Error reading upstream SSE stream", "error", err)
	}

	// Send metrics event after stream completes
	latencyMs := time.Since(startTime).Milliseconds()
	metricsEvent := MetricsEvent{
		Type: "response.metrics",
		Metrics: ResponseMetrics{
			LatencyMs:          latencyMs,
			TimeToFirstTokenMs: calculateTTFT(startTime, firstTokenTime),
			Usage:              usage,
		},
	}
	eventData, err := json.Marshal(metricsEvent)
	if err != nil {
		logger.Error("Failed to marshal metrics event", "error", err)
		return
	}
	fmt.Fprintf(w, "data: %s\n\n", eventData)
	flusher.Flush()
}
