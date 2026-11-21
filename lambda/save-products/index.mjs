// AWS Lambda entry point for POST /api/save-products.
//
// The business logic lives in netlify/functions/save-products.mjs and is
// reused verbatim. This wrapper only does the three things a Lambda needs:
//   1. load secrets from SSM Parameter Store into process.env (cached per
//      container, so no secret ever appears in Terraform state),
//   2. translate API Gateway's (event, context) into the web Request the
//      function already understands,
//   3. emit one structured JSON log line per invocation for CloudWatch.
//
// See infra/modules/save-products-api for the API Gateway contract.

import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";
import saveProducts from "../../netlify/functions/save-products.mjs";

const SECRET_NAMES = ["GITHUB_TOKEN", "GITHUB_REPO", "JWT_SECRET", "S3_BUCKET"];

// Parameters are cached for a few minutes. This keeps the per-request cost at
// zero on warm containers while still picking up a rotated secret without a
// full redeploy.
const SECRET_TTL_MS = 5 * 60_000;
const PLACEHOLDER = "REPLACE_ME";

const ssm = new SSMClient({});

let loadedAt = 0;
let loading = null;

async function loadSecrets() {
  // Local/dev runs set real env vars directly, so there is nothing to fetch.
  const prefix = process.env.SSM_PREFIX;
  if (!prefix) return;

  const names = SECRET_NAMES.map((name) => `${prefix}/${name}`);
  const res = await ssm.send(
    new GetParametersCommand({ Names: names, WithDecryption: true })
  );

  for (const param of res.Parameters || []) {
    const key = String(param.Name || "").split("/").pop();
    if (!SECRET_NAMES.includes(key)) continue;
    // Until an operator fills the parameter, the value is the placeholder.
    // Leave process.env unset so the handler reports a useful "missing" error.
    if (param.Value && param.Value !== PLACEHOLDER) process.env[key] = param.Value;
  }

  loadedAt = Date.now();
}

async function ensureSecrets() {
  if (Date.now() - loadedAt < SECRET_TTL_MS) return;
  if (!loading) loading = loadSecrets().finally(() => (loading = null));
  await loading;
}

// API Gateway (REST, proxy integration) -> web Request shape.
function fromApiGateway(event) {
  const method = event.httpMethod || event.requestContext?.http?.method || "POST";
  const raw = event.body || "";
  const text = event.isBase64Encoded
    ? Buffer.from(raw, "base64").toString("utf8")
    : raw;

  return {
    method,
    headers: event.headers || {},
    json: async () => JSON.parse(text),
  };
}

// web Response -> API Gateway (REST, proxy integration) result.
async function toApiGateway(res) {
  const headers = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return {
    statusCode: res.status,
    headers,
    body: await res.text(),
    isBase64Encoded: false,
  };
}

export const handler = async (event, context = {}) => {
  const startedAt = Date.now();
  const apiRequestId = event.requestContext?.requestId || null;
  const requestId = context.awsRequestId || apiRequestId;
  // API Gateway's request ID is the one written to its access log, so keep
  // both: CloudWatch Logs Insights can join the two streams on it.
  const correlationId = apiRequestId || requestId;
  const method = event.httpMethod || event.requestContext?.http?.method || "POST";
  const origin = event.headers?.origin || event.headers?.Origin || null;
  const isColdStart = !globalThis.__riddhiWarm;
  globalThis.__riddhiWarm = true;

  const log = (level, msg, extra = {}) =>
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        msg,
        requestId,
        apiRequestId,
        correlationId,
        functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || null,
        functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION || null,
        method,
        route: event.resource || event.path || null,
        origin,
        coldStart: isColdStart,
        ...extra,
      })
    );

  const path = event.path || event.requestContext?.path || event.resource || "";

  let result;
  try {
    if (method === "OPTIONS") {
      result = await toApiGateway(await saveProducts(fromApiGateway(event)));
    } else if (path.endsWith("/api/csp-report")) {
      const raw = event.body || "";
      const body = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
      log("warn", "csp-report", { report: body.slice(0, 8000) });
      result = {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
        body: "",
        isBase64Encoded: false,
      };
    } else {
      await ensureSecrets();
      result = await toApiGateway(await saveProducts(fromApiGateway(event)));
    }
  } catch (err) {
    log("error", "unhandled", {
      error: err?.message || String(err),
      stack: err?.stack || null,
    });
    result = {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
      },
      body: JSON.stringify({ ok: false, message: "Internal server error." }),
      isBase64Encoded: false,
    };
  }

  log(result.statusCode >= 500 ? "error" : "info", "request", {
    status: result.statusCode,
    durationMs: Date.now() - startedAt,
  });

  return result;
};
