package api

import (
	"fmt"
	"net/http"

	"github.com/julienschmidt/httprouter"
	"github.com/opendatahub-io/eval-hub/bff/internal/constants"
	helper "github.com/opendatahub-io/eval-hub/bff/internal/helpers"
	kubernetes "github.com/opendatahub-io/odh-dashboard/packages/autox-core/services/kubernetes"
)

var modelTypeRequiredKeys = map[string][]string{
	"model": {"api-key"},
}

// No keys are allowed through redaction for model secrets —
// the frontend only needs to see which keys exist, not their values.
var modelAllowedKeys = map[string]bool{}

type SecretsEnvelope = Envelope[[]kubernetes.SecretInfo, None]

// SecretsHandler handles GET /api/v1/secrets?namespace=...&type=model
func (app *App) SecretsHandler(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	ctx := r.Context()
	logger := helper.GetContextLoggerFromReq(r)

	namespace, ok := ctx.Value(constants.NamespaceHeaderParameterKey).(string)
	if !ok || namespace == "" {
		app.badRequestResponse(w, r, fmt.Errorf("missing namespace in context"))
		return
	}

	secretType := r.URL.Query().Get("type")
	if secretType != "" && secretType != "model" {
		app.badRequestResponse(w, r, fmt.Errorf("type must be 'model' or omitted"))
		return
	}

	allSecrets, err := app.k8sService.GetSecretInfos(ctx, namespace)
	if err != nil {
		logger.Error("failed to list secrets", "namespace", namespace, "error", err)
		app.serverErrorResponse(w, r, fmt.Errorf("failed to list secrets: %w", err))
		return
	}

	var secrets []kubernetes.SecretInfo
	if secretType == "model" {
		secrets = kubernetes.FilterSecretInfos(allSecrets, modelTypeRequiredKeys)
	} else {
		secrets = allSecrets
	}

	// Detect type and redact sensitive data
	for i := range secrets {
		secrets[i].Type = kubernetes.DetectSecretType(secrets[i], modelTypeRequiredKeys)
		secrets[i].Data = kubernetes.RedactSecretData(secrets[i].Data, modelAllowedKeys)
	}

	if err := app.WriteJSON(w, http.StatusOK, SecretsEnvelope{Data: secrets}, nil); err != nil {
		app.serverErrorResponse(w, r, err)
	}
}
