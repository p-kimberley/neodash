{{/*
Expand the name of the chart.
*/}}
{{- define "neodash.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "neodash.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "neodash.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "neodash.labels" -}}
helm.sh/chart: {{ include "neodash.chart" . }}
{{ include "neodash.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "neodash.selectorLabels" -}}
app.kubernetes.io/name: {{ include "neodash.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Labels for the `helm test` pod: deliberately not the selector labels, so the Deployment, Service
and NetworkPolicy don't treat it as a NeoDash pod.
*/}}
{{- define "neodash.testLabels" -}}
helm.sh/chart: {{ include "neodash.chart" . }}
app.kubernetes.io/name: {{ include "neodash.name" . }}-test
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "neodash.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "neodash.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Image reference: [global.imageRegistry | image.registry]/image.repository[@digest | :tag]
*/}}
{{- define "neodash.image" -}}
{{- $registry := .Values.global.imageRegistry | default .Values.image.registry -}}
{{- $repository := .Values.image.repository -}}
{{- $ref := ternary (printf "@%s" .Values.image.digest) (printf ":%s" (.Values.image.tag | default .Chart.AppVersion)) (ne .Values.image.digest "") -}}
{{- if $registry -}}
{{- printf "%s/%s%s" $registry $repository $ref -}}
{{- else -}}
{{- printf "%s%s" $repository $ref -}}
{{- end -}}
{{- end }}

{{/*
Name of the Secret holding the session key.
*/}}
{{- define "neodash.sessionSecretName" -}}
{{- .Values.session.existingSecret | default (printf "%s-session" (include "neodash.fullname" .)) -}}
{{- end }}

{{/*
Fail early, with a helpful message, on missing required values.
*/}}
{{- define "neodash.validate" -}}
{{- $_ := required "publicUrl is required, e.g. https://neodash.example.com" .Values.publicUrl -}}
{{- $_ := required "image.repository is required" .Values.image.repository -}}
{{- $_ := required "neo4j.auth.existingSecret is required: a Secret with the Neo4j username and password" .Values.neo4j.auth.existingSecret -}}
{{- $_ := required "oidc.issuerUrl is required, e.g. https://keycloak.example.com/realms/acme" .Values.oidc.issuerUrl -}}
{{- $_ := required "oidc.existingSecret is required: a Secret with the OIDC client secret" .Values.oidc.existingSecret -}}
{{- if .Values.ingress.enabled -}}
{{- $_ := required "ingress.host is required when ingress.enabled is true" .Values.ingress.host -}}
{{- if .Values.ingress.tls.enabled -}}
{{- $_ := required "ingress.tls.secretName is required when ingress.tls.enabled is true" .Values.ingress.tls.secretName -}}
{{- end -}}
{{- end -}}
{{- if .Values.text2cypher.baseUrl -}}
{{- $_ := required "text2cypher.model is required when text2cypher.baseUrl is set: the model name the API serves" .Values.text2cypher.model -}}
{{- end -}}
{{- if and .Values.httpRoute.enabled (not .Values.httpRoute.parentRefs) -}}
{{- fail "httpRoute.parentRefs is required when httpRoute.enabled is true: the Gateway to attach to" -}}
{{- end -}}
{{- if and .Values.oidc.caBundle.existingSecret .Values.oidc.caBundle.existingConfigMap -}}
{{- fail "set only one of oidc.caBundle.existingSecret and oidc.caBundle.existingConfigMap" -}}
{{- end -}}
{{- end }}

{{/*
Whether any branding is configured (renders the branding ConfigMap and mounts it).
*/}}
{{- define "neodash.branding.enabled" -}}
{{- if or .Values.branding.appName .Values.branding.logo.base64 .Values.branding.style -}}true{{- end -}}
{{- end }}
