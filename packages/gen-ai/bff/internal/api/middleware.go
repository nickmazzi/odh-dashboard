package api

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"runtime/debug"
	"strings"

	"github.com/opendatahub-io/gen-ai/internal/config"

	"github.com/julienschmidt/httprouter"
	"github.com/opendatahub-io/gen-ai/internal/integrations"

	"github.com/google/uuid"
	"github.com/opendatahub-io/gen-ai/internal/constants"
	helper "github.com/opendatahub-io/gen-ai/internal/helpers"
	"github.com/opendatahub-io/gen-ai/internal/integrations/llamastack"
	"github.com/opendatahub-io/gen-ai/internal/integrations/maas"
	mlflowpkg "github.com/opendatahub-io/gen-ai/internal/integrations/mlflow"
	nemopkg "github.com/opendatahub-io/gen-ai/internal/integrations/nemo"
	"github.com/rs/cors"
	k8svalidation "k8s.io/apimachinery/pkg/util/validation"
)

func (app *App) RecoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				w.Header().Set("Connection", "close")
				app.serverErrorResponse(w, r, fmt.Errorf("%s", err))
				logger := helper.GetContextLoggerFromReq(r)
				logger.Error("Recovered from panic", slog.String("stack_trace", string(debug.Stack())))
			}
		}()

		next.ServeHTTP(w, r)
	})
}

func (app *App) EnableCORS(next http.Handler) http.Handler {
	if len(app.config.AllowedOrigins) == 0 {
		// CORS is disabled, this middleware becomes a noop.
		return next
	}

	c := cors.New(cors.Options{
		AllowedOrigins:     app.config.AllowedOrigins,
		AllowCredentials:   true,
		AllowedMethods:     []string{"GET", "PUT", "POST", "PATCH", "DELETE"},
		AllowedHeaders:     []string{},
		Debug:              app.config.LogLevel == slog.LevelDebug,
		OptionsPassthrough: false,
	})

	return c.Handler(next)
}

func (app *App) EnableTelemetry(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Adds a unique id to the context to allow tracing of requests
		traceId := uuid.NewString()
		ctx := context.WithValue(r.Context(), constants.TraceIdKey, traceId)

		// logger will only be nil in tests.
		if app.logger != nil {
			traceLogger := app.logger.With(slog.String("trace_id", traceId))
			ctx = context.WithValue(ctx, constants.TraceLoggerKey, traceLogger)

			traceLogger.Debug("Incoming HTTP request", slog.Any("request", helper.RequestLogValuer{Request: r}))
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (app *App) InjectRequestIdentity(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		//skip use headers check if we are not on the configured API path prefix (i.e. we are on /healthcheck and / (static fe files) )
		// Check for both direct API path and prefixed API path
		isAPIPath := strings.HasPrefix(r.URL.Path, app.config.APIPathPrefix) ||
			strings.HasPrefix(r.URL.Path, constants.PathPrefix+app.config.APIPathPrefix)

		if !isAPIPath {
			next.ServeHTTP(w, r)
			return
		}

		// If authentication is disabled, inject a dummy identity so downstream
		// handlers that read RequestIdentity from context don't fail.
		if app.config.AuthMethod == config.AuthMethodDisabled {
			ctx := context.WithValue(r.Context(), constants.RequestIdentityKey, &integrations.RequestIdentity{})
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		identity, err := app.kubernetesClientFactory.ExtractRequestIdentity(r.Header)
		if err != nil {
			app.unauthorizedResponse(w, r, err)
			return
		}

		ctx := context.WithValue(r.Context(), constants.RequestIdentityKey, identity)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireGuardrailAccess validates identity and checks CanListGuardrailsOrchestrator permissions.
func (app *App) RequireGuardrailAccess(next func(http.ResponseWriter, *http.Request, httprouter.Params)) httprouter.Handle {
	return func(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
		if app.config.AuthMethod == config.AuthMethodDisabled {
			next(w, r, ps)
			return
		}

		ctx := r.Context()
		identity, ok := ctx.Value(constants.RequestIdentityKey).(*integrations.RequestIdentity)

		if !ok || identity == nil {
			app.badRequestResponse(w, r, fmt.Errorf("missing RequestIdentity in context"))
			return
		}

		if err := app.kubernetesClientFactory.ValidateRequestIdentity(identity); err != nil {
			app.badRequestResponse(w, r, err)
			return
		}

		if namespace, ok := ctx.Value(constants.NamespaceQueryParameterKey).(string); ok && namespace != "" {
			k8sClient, err := app.kubernetesClientFactory.GetClient(ctx)
			if err != nil {
				app.serverErrorResponse(w, r, fmt.Errorf("failed to get Kubernetes client: %w", err))
				return
			}

			allowed, err := k8sClient.CanListGuardrailsOrchestrator(ctx, identity, namespace)
			if err != nil {
				app.handleK8sClientError(w, r, err)
				return
			}

			if !allowed {
				app.forbiddenResponse(w, r, "user does not have permission to access guardrails in this namespace")
				return
			}
		}

		next(w, r, ps)
	}
}

func (app *App) RequireAccessToService(next func(http.ResponseWriter, *http.Request, httprouter.Params)) httprouter.Handle {
	return func(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
		// If authentication is disabled skip these steps.
		if app.config.AuthMethod == config.AuthMethodDisabled {
			next(w, r, ps)
			return
		}

		ctx := r.Context()
		identity, ok := ctx.Value(constants.RequestIdentityKey).(*integrations.RequestIdentity)

		if !ok || identity == nil {
			app.badRequestResponse(w, r, fmt.Errorf("missing RequestIdentity in context"))
			return
		}

		if err := app.kubernetesClientFactory.ValidateRequestIdentity(identity); err != nil {
			app.badRequestResponse(w, r, err)
			return
		}

		// Apply LlamaStack authorization check to all endpoints that require namespace access
		// This ensures consistent security across all services (LlamaStack, MCP, etc.)
		// Check if namespace is present in context (set by AttachNamespace middleware)
		if namespace, ok := ctx.Value(constants.NamespaceQueryParameterKey).(string); ok && namespace != "" {
			// Get Kubernetes client to perform SAR
			k8sClient, err := app.kubernetesClientFactory.GetClient(ctx)
			if err != nil {
				app.serverErrorResponse(w, r, fmt.Errorf("failed to get Kubernetes client: %w", err))
				return
			}

			// Perform SubjectAccessReview to check if user can list LlamaStackDistribution resources
			// This ensures users have proper permissions to access any service in the namespace
			allowed, err := k8sClient.CanListLlamaStackDistributions(ctx, identity, namespace)
			if err != nil {
				app.handleK8sClientError(w, r, err)
				return
			}

			if !allowed {
				app.forbiddenResponse(w, r, "user does not have permission to access services in this namespace")
				return
			}

			logger := helper.GetContextLoggerFromReq(r)
			logger.Debug("User authorized to access services in namespace", "namespace", namespace)
		}

		logger := helper.GetContextLoggerFromReq(r)
		logger.Debug("Request authorized")

		next(w, r, ps)
	}
}

func (app *App) AttachNamespace(next func(http.ResponseWriter, *http.Request, httprouter.Params)) httprouter.Handle {
	return func(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
		namespace := r.URL.Query().Get(string(constants.NamespaceQueryParameterKey))
		if namespace == "" {
			app.badRequestResponse(w, r, fmt.Errorf("missing required query parameter: %s", constants.NamespaceQueryParameterKey))
			return
		}

		ctx := context.WithValue(r.Context(), constants.NamespaceQueryParameterKey, namespace)
		r = r.WithContext(ctx)

		next(w, r, ps)
	}
}

// AttachLlamaStackClient middleware creates a LlamaStack client for the namespace and attaches it to context.
// This middleware must be used after AttachNamespace middleware.
//
// Gets the LlamaStack URL from the namespace-specific LlamaStackDistribution resource's status.serviceURL field.
func (app *App) AttachLlamaStackClient(next func(http.ResponseWriter, *http.Request, httprouter.Params)) httprouter.Handle {
	return func(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
		ctx := r.Context()

		// Get namespace from context (set by AttachNamespace middleware)
		namespace, ok := ctx.Value(constants.NamespaceQueryParameterKey).(string)
		if !ok || namespace == "" {
			app.badRequestResponse(w, r, fmt.Errorf("missing namespace in context - ensure AttachNamespace middleware is used first"))
			return
		}

		// Use request-scoped logger to avoid nil-panic in tests/environments where app.logger is not set
		logger := helper.GetContextLoggerFromReq(r)

		var llamaStackClient llamastack.LlamaStackClientInterface

		// Check if running in mock mode
		if app.config.MockLSClient {
			logger.Debug("MOCK MODE: creating mock LlamaStack client for namespace", "namespace", namespace)
			// In mock mode, use empty URL since mock factory ignores it
			llamaStackClient = app.llamaStackClientFactory.CreateClient("", "", app.config.InsecureSkipVerify, app.rootCAs, "/v1")
		} else {
			var serviceURL string
			// Use environment variable if explicitly set (developer override)
			if app.config.LlamaStackURL != "" {
				serviceURL = app.config.LlamaStackURL
				logger.Debug("Using LLAMA_STACK_URL environment variable (developer override)",
					"namespace", namespace,
					"serviceURL", serviceURL)
			} else {
				identity, ok := ctx.Value(constants.RequestIdentityKey).(*integrations.RequestIdentity)
				if !ok || identity == nil {
					app.serverErrorResponse(w, r, fmt.Errorf("missing RequestIdentity in context"))
					return
				}

				k8sClient, err := app.kubernetesClientFactory.GetClient(ctx)
				if err != nil {
					app.serverErrorResponse(w, r, fmt.Errorf("failed to get Kubernetes client: %w", err))
					return
				}

				// Get LlamaStackDistribution list using existing client method
				lsdList, err := k8sClient.GetLlamaStackDistributions(ctx, identity, namespace)
				if err != nil {
					app.serverErrorResponse(w, r, fmt.Errorf("failed to get LlamaStackDistributions: %w", err))
					return
				}

				if len(lsdList.Items) == 0 {
					app.serverErrorResponse(w, r, fmt.Errorf("no LlamaStackDistribution found in namespace %q", namespace))
					return
				}
				if len(lsdList.Items) > 1 {
					app.logger.Warn(fmt.Sprintf("warning: %d LlamaStackDistributions found in namespace %q, using the first", len(lsdList.Items), namespace))
				}

				lsd := lsdList.Items[0]
				serviceURL = lsd.Status.ServiceURL

				if serviceURL == "" {
					app.serverErrorResponse(w, r, fmt.Errorf("LlamaStackDistribution %s has no service url", lsd.Name))
					return
				}

				logger.Debug("Using ServiceURL from LlamaStackDistribution",
					"namespace", namespace,
					"lsdName", lsd.Name,
					"serviceURL", serviceURL)
			}

			logger.Debug("Creating LlamaStack client for namespace",
				"namespace", namespace,
				"serviceURL", serviceURL)

			// Create LlamaStack client per-request using app factory (consistent with K8s pattern)
			// Get identity from context for auth token
			identity, ok := ctx.Value(constants.RequestIdentityKey).(*integrations.RequestIdentity)
			if !ok || identity == nil {
				app.serverErrorResponse(w, r, fmt.Errorf("missing RequestIdentity in context"))
				return
			}

			// Create LlamaStack client with auth token from identity
			// llama-stack v0.4.0+ uses /v1 for all OpenAI-compatible endpoints
			llamaStackClient = app.llamaStackClientFactory.CreateClient(serviceURL, identity.Token, app.config.InsecureSkipVerify, app.rootCAs, "/v1")
		}

		// Attach ready-to-use client to context
		ctx = context.WithValue(ctx, constants.LlamaStackClientKey, llamaStackClient)
		r = r.WithContext(ctx)

		next(w, r, ps)
	}
}

// AttachMaaSClient middleware creates a MaaS client and attaches it to context.
// This middleware can be used independently and doesn't require namespace.
//
// In mock mode, creates a mock client. In real mode, uses autodiscovery or configured MaaS URL.
// Uses RequestIdentity from context for authentication, consistent with other clients.
func (app *App) AttachMaaSClient(next func(http.ResponseWriter, *http.Request, httprouter.Params)) httprouter.Handle {
	return func(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
		ctx := r.Context()

		// Use request-scoped logger to avoid nil-panic in tests/environments where app.logger is not set
		logger := helper.GetContextLoggerFromReq(r)

		var maasClient maas.MaaSClient

		// Check if running in mock mode
		if app.config.MockMaaSClient {
			logger.Debug("MOCK MODE: creating mock MaaS client")
			// In mock mode, use empty URL since mock factory ignores it
			maasClient = app.maasClientFactory.CreateClient("", "", app.config.InsecureSkipVerify, app.rootCAs)
		} else {
			var serviceURL string

			if app.config.MaaSURL != "" {
				serviceURL = app.config.MaaSURL
				logger.Debug("Using MAAS_URL environment variable (developer override)",
					"serviceURL", serviceURL)
			} else if app.clusterDomain != "" {
				serviceURL = fmt.Sprintf("https://maas.%s/maas-api", app.clusterDomain)
				logger.Debug("Using autodiscovered MaaS endpoint from cached cluster domain",
					"clusterDomain", app.clusterDomain,
					"serviceURL", serviceURL)
			} else {
				logger.Debug("MaaS unavailable: no MAAS_URL configured and cluster domain not available")
				ctx = context.WithValue(ctx, constants.MaaSClientKey, nil)
				next(w, r.WithContext(ctx), ps)
				return
			}

			// Get RequestIdentity from context (set by InjectRequestIdentity middleware)
			identity, ok := ctx.Value(constants.RequestIdentityKey).(*integrations.RequestIdentity)
			if !ok || identity == nil {
				app.serverErrorResponse(w, r, fmt.Errorf("missing RequestIdentity in context"))
				return
			}

			logger.Debug("Creating MaaS client",
				"serviceURL", serviceURL,
				"hasAuthToken", identity.Token != "")

			// Create MaaS client per-request using app factory with auth token from RequestIdentity
			maasClient = app.maasClientFactory.CreateClient(serviceURL, identity.Token, app.config.InsecureSkipVerify, app.rootCAs)
		}

		// Attach ready-to-use client to context
		ctx = context.WithValue(ctx, constants.MaaSClientKey, maasClient)
		r = r.WithContext(ctx)

		next(w, r, ps)
	}
}

// AttachMLflowClient middleware creates a per-request MLflow client with auth and workspace headers.
// Extracts the user's token from RequestIdentity and namespace from context.
func (app *App) AttachMLflowClient(next func(http.ResponseWriter, *http.Request, httprouter.Params)) httprouter.Handle {
	return func(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
		ctx := r.Context()

		// Extract auth token from RequestIdentity (set by InjectRequestIdentity middleware)
		var token string
		if app.config.AuthMethod != config.AuthMethodDisabled {
			identity, ok := ctx.Value(constants.RequestIdentityKey).(*integrations.RequestIdentity)
			if !ok || identity == nil {
				app.serverErrorResponse(w, r, fmt.Errorf("missing RequestIdentity in context"))
				return
			}
			token = identity.Token
		}

		// Extract namespace (set by AttachNamespace middleware)
		namespace, _ := ctx.Value(constants.NamespaceQueryParameterKey).(string)

		mlflowClient, err := app.mlflowClientFactory.GetClient(ctx, token, namespace)
		if err != nil {
			if errors.Is(err, mlflowpkg.ErrMLflowNotConfigured) {
				logger := helper.GetContextLoggerFromReq(r)
				logger.Warn("MLflow endpoint called but MLflow is not configured",
					"method", r.Method, "uri", r.URL.RequestURI())
				app.errorResponse(w, r, &integrations.HTTPError{
					StatusCode: http.StatusServiceUnavailable,
					ErrorResponse: integrations.ErrorResponse{
						Code:    "service_unavailable",
						Message: "MLflow is not configured on this deployment",
					},
				})
				return
			}
			app.serverErrorResponse(w, r, fmt.Errorf("failed to get MLflow client: %w", err))
			return
		}

		ctx = context.WithValue(ctx, constants.MLflowClientKey, mlflowClient)
		r = r.WithContext(ctx)

		next(w, r, ps)
	}
}

// AttachBFFMaaSClient middleware creates a BFF client for inter-BFF communication with MaaS BFF
// and attaches it to the request context. This is used for endpoints that need to call MaaS BFF
// rather than the MaaS controller directly.
func (app *App) AttachBFFMaaSClient(next func(http.ResponseWriter, *http.Request, httprouter.Params)) httprouter.Handle {
	return func(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
		ctx := r.Context()
		logger := helper.GetContextLoggerFromReq(r)

		// Check if BFF client factory is available
		if app.bffClientFactory == nil {
			logger.Warn("BFF client factory not initialized")
			app.errorResponse(w, r, &integrations.HTTPError{
				StatusCode: http.StatusServiceUnavailable,
				ErrorResponse: integrations.ErrorResponse{
					Code:    "service_unavailable",
					Message: "BFF inter-communication is not configured",
				},
			})
			return
		}

		// Check if MaaS BFF target is configured
		if !app.bffClientFactory.IsTargetConfigured("maas") {
			logger.Debug("MaaS BFF target not configured, attaching nil client")
			ctx = context.WithValue(ctx, constants.BFFClientKey(constants.BFFTarget("maas")), nil)
			next(w, r.WithContext(ctx), ps)
			return
		}

		// Get auth token from RequestIdentity
		var authToken string
		if identity, ok := ctx.Value(constants.RequestIdentityKey).(*integrations.RequestIdentity); ok && identity != nil {
			authToken = identity.Token
		}

		// Build headers based on MaaS BFF's auth method
		forwardHeaders := make(map[string]string)
		maasConfig := app.bffClientFactory.GetConfig("maas")

		if maasConfig != nil && maasConfig.AuthMethod == "internal" {
			// For internal auth mode (Kubeflow only), forward kubeflow identity headers
			if userID := r.Header.Get("kubeflow-userid"); userID != "" {
				forwardHeaders["kubeflow-userid"] = userID
			}
			if groups := r.Header.Get("kubeflow-groups"); groups != "" {
				forwardHeaders["kubeflow-groups"] = groups
			}
			logger.Debug("Using internal auth mode for MaaS BFF, forwarding kubeflow headers")
		} else {
			// For user_token auth mode (default for ODH), the token is sent via
			// the configured auth header by the client itself
			logger.Debug("Using user_token auth mode for MaaS BFF")
		}

		// Create BFF client for MaaS target with forwarded headers
		client := app.bffClientFactory.CreateClientWithHeaders("maas", authToken, forwardHeaders)
		if client == nil {
			logger.Warn("Failed to create MaaS BFF client")
			ctx = context.WithValue(ctx, constants.BFFClientKey(constants.BFFTarget("maas")), nil)
			next(w, r.WithContext(ctx), ps)
			return
		}

		logger.Debug("Created MaaS BFF client", "baseURL", client.GetBaseURL())

		// Attach to context
		ctx = context.WithValue(ctx, constants.BFFClientKey(constants.BFFTarget("maas")), client)
		next(w, r.WithContext(ctx), ps)
	}
}

// AttachNemoClient middleware creates a NeMo Guardrails client and attaches it to context.
// Mirrors AttachLlamaStackClient: uses the user's forwarded token and discovers the service URL
// from the NemoGuardrails CR (trustyai.opendatahub.io/v1alpha1) when NEMO_GUARDRAILS_URL is not set.
func (app *App) AttachNemoClient(next func(http.ResponseWriter, *http.Request, httprouter.Params)) httprouter.Handle {
	return func(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
		ctx := r.Context()
		logger := helper.GetContextLoggerFromReq(r)

		var nemoClient nemopkg.NemoClientInterface

		if app.config.MockNemoClient {
			logger.Debug("MOCK MODE: creating mock NeMo Guardrails client")
			nemoClient = app.nemoClientFactory.CreateClient("", "", app.config.InsecureSkipVerify, app.rootCAs)
		} else {
			identity, ok := ctx.Value(constants.RequestIdentityKey).(*integrations.RequestIdentity)
			if !ok || identity == nil {
				app.serverErrorResponse(w, r, fmt.Errorf("missing RequestIdentity in context"))
				return
			}

			var serviceURL string

			if app.config.NemoGuardrailsURL != "" {
				// Developer override — same pattern as LLAMA_STACK_URL
				serviceURL = app.config.NemoGuardrailsURL
				logger.Debug("Using NEMO_GUARDRAILS_URL environment variable (developer override)",
					"serviceURL", serviceURL)
			} else {
				// Auto-discover from NemoGuardrails CR in the request namespace
				namespace, _ := ctx.Value(constants.NamespaceQueryParameterKey).(string)
				k8sClient, err := app.kubernetesClientFactory.GetClient(ctx)
				if err != nil {
					app.serverErrorResponse(w, r, fmt.Errorf("failed to get Kubernetes client: %w", err))
					return
				}

				discoveredURL, err := k8sClient.GetNemoGuardrailsServiceURL(ctx, identity, namespace)
				if err != nil {
					app.serverErrorResponse(w, r, fmt.Errorf("failed to discover NemoGuardrails service: %w", err))
					return
				}

				if discoveredURL == "" {
					logger.Debug("NeMo Guardrails unavailable: no NemoGuardrails CR found in namespace", "namespace", namespace)
					ctx = context.WithValue(ctx, constants.NemoClientKey, nil)
					next(w, r.WithContext(ctx), ps)
					return
				}

				serviceURL = discoveredURL
				logger.Debug("Discovered NemoGuardrails service URL from CR",
					"namespace", namespace,
					"serviceURL", serviceURL)
			}

			logger.Debug("Creating NeMo Guardrails client",
				"serviceURL", serviceURL,
				"hasAuthToken", identity.Token != "")

			nemoClient = app.nemoClientFactory.CreateClient(serviceURL, identity.Token, app.config.InsecureSkipVerify, app.rootCAs)
		}

		ctx = context.WithValue(ctx, constants.NemoClientKey, nemoClient)
		r = r.WithContext(ctx)

		next(w, r, ps)
	}
}

// isValidDNS1123Subdomain validates a string against DNS-1123 subdomain rules.
func isValidDNS1123Subdomain(name string) bool {
	return len(k8svalidation.IsDNS1123Subdomain(name)) == 0
}

// validateIP checks an IP address against the SSRF blocklist.
// Loopback (127.x, ::1), link-local (169.254.x — cloud metadata), and unspecified (0.0.0.0) are blocked.
// Private ranges (10.x, 172.16.x, 192.168.x) are intentionally allowed for cluster-internal services.
func validateIP(ip net.IP) error {
	if ip.IsLoopback() {
		return fmt.Errorf("loopback addresses are not allowed")
	}
	if ip.IsLinkLocalUnicast() {
		return fmt.Errorf("link-local addresses are not allowed")
	}
	if ip.IsUnspecified() {
		return fmt.Errorf("unspecified addresses are not allowed")
	}
	return nil
}

// isValidLlamaStackURL validates a URL extracted from a Kubernetes secret to prevent SSRF attacks.
// Only http and https schemes are allowed. For IP literals, the IP is checked directly.
// For DNS hostnames, all resolved A/AAAA records are validated against the same blocklist.
func isValidLlamaStackURL(rawURL string) error {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL format: %w", err)
	}

	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return fmt.Errorf("invalid URL scheme %q: only http and https are allowed", parsedURL.Scheme)
	}

	host := parsedURL.Hostname()
	if host == "" {
		return fmt.Errorf("URL must contain a host")
	}

	// Check IP literals directly
	if ip := net.ParseIP(host); ip != nil {
		return validateIP(ip)
	}

	// Resolve DNS hostnames and validate all resulting IPs.
	// If DNS resolution fails, allow it through — the hostname may only be resolvable
	// inside the cluster (e.g., svc.cluster.local). The HTTP client will fail with a
	// connection error later, which is handled as a 502 Bad Gateway.
	ips, err := net.LookupIP(host)
	if err == nil {
		for _, ip := range ips {
			if err := validateIP(ip); err != nil {
				return fmt.Errorf("hostname %q resolves to blocked address: %w", host, err)
			}
		}
	}

	return nil
}

// getSecretValueCaseInsensitive retrieves a secret value using case-insensitive key matching.
// It first tries the exact key, then falls back to case-insensitive search.
// Returns the value and whether the key was found.
func (app *App) getSecretValueCaseInsensitive(ctx context.Context, namespace, secretName, key string) (string, bool, error) {
	identity, ok := ctx.Value(constants.RequestIdentityKey).(*integrations.RequestIdentity)
	if !ok || identity == nil {
		return "", false, fmt.Errorf("missing RequestIdentity in context")
	}

	k8sClient, err := app.kubernetesClientFactory.GetClient(ctx)
	if err != nil {
		return "", false, fmt.Errorf("failed to get Kubernetes client: %w", err)
	}

	// Try exact key first
	val, err := k8sClient.GetSecretValue(ctx, identity, namespace, secretName, key)
	if err == nil && val != "" {
		return val, true, nil
	}

	// If exact key failed, try common case variations
	variations := []string{
		strings.ToLower(key),
		strings.ToUpper(key),
	}
	for _, variant := range variations {
		if variant == key {
			continue // skip if same as original
		}
		val, err = k8sClient.GetSecretValue(ctx, identity, namespace, secretName, variant)
		if err == nil && val != "" {
			return val, true, nil
		}
	}

	return "", false, nil
}

// AttachLlamaStackClientFromSecret creates a LlamaStack client using credentials from a Kubernetes secret
// and attaches it to context. The secret must contain llama_stack_client_base_url and llama_stack_client_api_key.
// This middleware must be used after AttachNamespace middleware.
//
// Precedence for determining the LlamaStack connection:
//  1. Mock mode (MockLSClient): uses a mock client, ignores all other config.
//  2. Secret-based: reads URL and API key from the named Kubernetes secret.
func (app *App) AttachLlamaStackClientFromSecret(next func(http.ResponseWriter, *http.Request, httprouter.Params)) httprouter.Handle {
	return func(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
		ctx := r.Context()

		// Read and validate secretName query parameter
		secretName := r.URL.Query().Get("secretName")
		if secretName == "" {
			app.badRequestResponse(w, r, fmt.Errorf("missing required query parameter: secretName"))
			return
		}
		if !isValidDNS1123Subdomain(secretName) {
			app.badRequestResponse(w, r, fmt.Errorf("invalid secretName: must be a valid DNS-1123 subdomain (lowercase alphanumeric, '-', or '.', start/end with alphanumeric, max 253 chars)"))
			return
		}

		// Get namespace from context (set by AttachNamespace middleware)
		namespace, ok := ctx.Value(constants.NamespaceQueryParameterKey).(string)
		if !ok || namespace == "" {
			app.badRequestResponse(w, r, fmt.Errorf("missing namespace in context - ensure AttachNamespace middleware is used first"))
			return
		}

		logger := helper.GetContextLoggerFromReq(r)

		var llamaStackClient llamastack.LlamaStackClientInterface

		var baseURL, apiKey string

		if app.config.MockLSClient {
			// Mock mode: skip secret lookup entirely
			logger.Debug("MOCK MODE: creating mock LlamaStack client (secret-based)", "namespace", namespace, "secretName", secretName)
			llamaStackClient = app.llamaStackClientFactory.CreateClient("", "", app.config.InsecureSkipVerify, app.rootCAs, "/v1")
		} else {
			// Production: read credentials from Kubernetes secret
			var foundBaseURL bool
			var err error
			baseURL, foundBaseURL, err = app.getSecretValueCaseInsensitive(ctx, namespace, secretName, "llama_stack_client_base_url")
			if err != nil {
				app.serverErrorResponse(w, r, fmt.Errorf("failed to read secret %q: %w", secretName, err))
				return
			}
			if !foundBaseURL || baseURL == "" {
				app.badRequestResponse(w, r, fmt.Errorf("secret %q is missing or has empty value for required key: llama_stack_client_base_url", secretName))
				return
			}

			var foundAPIKey bool
			apiKey, foundAPIKey, err = app.getSecretValueCaseInsensitive(ctx, namespace, secretName, "llama_stack_client_api_key")
			if err != nil {
				app.serverErrorResponse(w, r, fmt.Errorf("failed to read secret %q: %w", secretName, err))
				return
			}
			if !foundAPIKey {
				app.badRequestResponse(w, r, fmt.Errorf("secret %q is missing required key: llama_stack_client_api_key", secretName))
				return
			}

			if err := isValidLlamaStackURL(baseURL); err != nil {
				app.badRequestResponse(w, r, fmt.Errorf("invalid llama_stack_client_base_url in secret %q: %w", secretName, err))
				return
			}

			logger.Debug("Creating LlamaStack client from secret",
				"namespace", namespace,
				"secretName", secretName,
				"serviceURL", baseURL)

			llamaStackClient = app.llamaStackClientFactory.CreateClient(baseURL, apiKey, app.config.InsecureSkipVerify, app.rootCAs, "/v1")
		}

		// Attach ready-to-use client to context
		ctx = context.WithValue(ctx, constants.LlamaStackClientKey, llamaStackClient)
		// Also store raw connection info for passthrough handlers that need to forward raw requests
		ctx = context.WithValue(ctx, constants.LlamaStackBaseURLKey, baseURL)
		ctx = context.WithValue(ctx, constants.LlamaStackAPIKeyCtxKey, apiKey)
		r = r.WithContext(ctx)

		next(w, r, ps)
	}
}
