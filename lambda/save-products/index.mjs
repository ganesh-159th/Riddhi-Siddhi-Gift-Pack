// AWS Lambda entry point for the admin + contact API (issue #130).
//
// One Lambda serves every /api/* route; API Gateway maps each route to it with
// an AWS_PROXY integration. The wrapper:
//   1. loads secrets from SSM Parameter Store into process.env (cached per
//      container, so no secret ever appears in Terraform state),
//   2. translates API Gateway's (event, context) into the web Request each
//      handler already understands,
//   3. emits one structured JSON log line per invocation for CloudWatch.
//
// See infra/modules/save-products-api for the API Gateway contract.

import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";
import adminLogin from "../handlers/admin-login.mjs";
import historyProducts from "../handlers/history-products.mjs";
import rollbackProducts from "../handlers/rollback-products.mjs";
import presignImage from "../handlers/presign-image.mjs";
import processImage from "../handlers/process-image.mjs";
import saveProducts from "../handlers/save-products.mjs";
import submitEnquiry from "../handlers/submit-enquiry.mjs";

const ROUTES = new Map([
  ["/api/admin-login", adminLogin],
  ["/api/history-products", historyProducts],
  ["/api/rollback-products", rollbackProducts],
  ["/api/presign-image", presignImage],
  ["/api/process-image", processImage],
  ["/api/save-products", saveProducts],
  ["/api/submit-enquiry", submitEnquiry],
]);

const SECRET_NAMES = [
  "GITHUB_TOKEN",
  "GITHUB_REPO",
  "JWT_SECRET",
  "S3_BUCKET",
  "ENQUIRIES_BUCKET",
  "ADMIN_TOKEN",
];

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
    headers: new Map(
      Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value])
    ),
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

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
};

const errorResult = (status, body) => ({
  statusCode: status,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
  isBase64Encoded: false,
});

function routeOf(event) {
  if (event.resource && ROUTES.has(event.resource)) return event.resource;
  const parts = String(event.path || "").split("/").filter(Boolean);
  if (!parts.length) return "/api/save-products";
  return "/" + parts.slice(-2).join("/");
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
  const route = routeOf(event);

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
        route,
        origin,
        coldStart: isColdStart,
        ...extra,
      })
    );

  let result;
  try {
    if (route === "/api/csp-report" && method === "POST") {
      const raw = event.body || "";
      const body = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
      log("warn", "csp-report", { report: body.slice(0, 8000) });
      result = {
        statusCode: 204,
        headers: CORS_HEADERS,
        body: "",
        isBase64Encoded: false,
      };
    } else {
      const routeHandler = ROUTES.get(route);
      if (!routeHandler) {
        result = errorResult(404, { ok: false, message: "Unknown API route." });
      } else if (method === "OPTIONS") {
        result = await toApiGateway(await routeHandler(fromApiGateway(event)));
      } else if (method === "POST") {
        await ensureSecrets();
        result = await toApiGateway(await routeHandler(fromApiGateway(event)));
      } else {
        result = errorResult(405, { ok: false, message: "Method not allowed." });
      }
    }
  } catch (err) {
    log("error", "unhandled", {
      error: err?.message || String(err),
      stack: err?.stack || null,
    });
    result = errorResult(500, { ok: false, message: "Internal server error." });
  }

  log(result.statusCode >= 500 ? "error" : "info", "request", {
    status: result.statusCode,
    durationMs: Date.now() - startedAt,
  });

  return result;
};
