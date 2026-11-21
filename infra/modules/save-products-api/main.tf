# Admin API — the AWS half of the admin publish pipeline and contact form.
#
# All /api/* routes are served by one Lambda behind API Gateway (issue #130).
# Cost profile (see infra/README.md): everything here stays inside the free
# tier at admin-publish volumes. Deliberate choices:
#   * No VPC — avoids a NAT Gateway (~$32/month). The function only needs the
#     public GitHub API and S3, both reachable over the internet.
#   * Secrets live in SSM Parameter Store (standard params are free) and are
#     fetched at runtime, so they never enter Terraform state.
#   * Rate limiting is an API Gateway usage plan, not WAF (~free vs ~$6/month).
#   * CloudWatch retention is set explicitly so logs cannot grow forever.

locals {
  lambda_zip_path = var.lambda_zip_path != "" ? var.lambda_zip_path : "${path.root}/.build/save-products.zip"

  routes = {
    "admin-login"       = { api_key_required = true }
    "history-products"  = { api_key_required = true }
    "rollback-products" = { api_key_required = true }
    "presign-image"     = { api_key_required = true }
    "process-image"     = { api_key_required = true }
    "submit-enquiry"    = { api_key_required = false }
  }
}

# ---------------------------------------------------------------------------
# Lambda package
# ---------------------------------------------------------------------------
data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = var.lambda_source_dir
  output_path = local.lambda_zip_path
}

# ---------------------------------------------------------------------------
# IAM — least privilege
# ---------------------------------------------------------------------------
data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "lambda" {
  statement {
    sid       = "ReadBackendSecrets"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = var.secret_parameter_arns
  }

  statement {
    sid       = "DecryptBackendSecrets"
    actions   = ["kms:Decrypt"]
    resources = [data.aws_kms_alias.ssm.target_key_arn]
  }

  statement {
    sid       = "ListProductImages"
    actions   = ["s3:ListBucket"]
    resources = [var.s3_bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["products/*"]
    }
  }

  statement {
    sid       = "DeleteOrphanImages"
    actions   = ["s3:DeleteObject"]
    resources = ["${var.s3_bucket_arn}/products/*"]
  }

  statement {
    sid       = "SaveEnquiries"
    actions   = ["s3:PutObject"]
    resources = ["${var.enquiries_bucket_arn}/enquiries/*"]
  }

  statement {
    sid       = "WriteInvocationLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.lambda.arn}:*"]
  }
}

resource "aws_iam_role_policy" "lambda" {
  name   = "${var.function_name}-policy"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda.json
}

# ---------------------------------------------------------------------------
# CloudWatch Logs
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

# API Gateway access logs capture the request ID, status, latency and API key
# ID for every call (issue #39). The 429 metric filter in the observability
# module reads this log group.
resource "aws_cloudwatch_log_group" "api_access" {
  count = var.enable_access_logging ? 1 : 0

  name              = "/aws/apigateway/${var.function_name}-access"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

# API Gateway needs an account-level role before it can write access logs to
# CloudWatch. This setting is regional and account-wide; disable it if another
# stack already owns the setting.
data "aws_partition" "current" {}

data "aws_iam_policy_document" "apigateway_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["apigateway.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apigateway_cloudwatch" {
  count = var.enable_access_logging && var.manage_apigateway_account_settings ? 1 : 0

  name               = "${var.function_name}-apigw-cloudwatch"
  assume_role_policy = data.aws_iam_policy_document.apigateway_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "apigateway_cloudwatch" {
  count = var.enable_access_logging && var.manage_apigateway_account_settings ? 1 : 0

  role       = aws_iam_role.apigateway_cloudwatch[0].name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

resource "aws_api_gateway_account" "this" {
  count = var.enable_access_logging && var.manage_apigateway_account_settings ? 1 : 0

  cloudwatch_role_arn = aws_iam_role.apigateway_cloudwatch[0].arn

  depends_on = [aws_iam_role_policy_attachment.apigateway_cloudwatch]
}

# ---------------------------------------------------------------------------
# Lambda function
# ---------------------------------------------------------------------------
resource "aws_lambda_function" "save_products" {
  function_name = var.function_name
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  memory_size                    = var.memory_size
  timeout                        = var.timeout_seconds
  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = {
      SSM_PREFIX                          = var.secret_parameter_prefix
      ORPHAN_GRACE_MINUTES                = tostring(var.orphan_grace_minutes)
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy.lambda,
  ]

  tags = var.tags
}

# ---------------------------------------------------------------------------
# API Gateway (REST — usage plans are only supported on REST APIs)
# ---------------------------------------------------------------------------
resource "aws_api_gateway_rest_api" "this" {
  name        = "${var.function_name}-api"
  description = "Admin API and contact endpoint on Lambda + API Gateway"
  tags        = var.tags

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_resource" "api" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "api"
}

resource "aws_api_gateway_resource" "save_products" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.api.id
  path_part   = "save-products"
}

resource "aws_api_gateway_resource" "csp_report" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.api.id
  path_part   = "csp-report"
}

resource "aws_api_gateway_resource" "route" {
  for_each = local.routes

  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.api.id
  path_part   = each.key
}

resource "aws_api_gateway_method" "route_post" {
  for_each = local.routes

  rest_api_id      = aws_api_gateway_rest_api.this.id
  resource_id      = aws_api_gateway_resource.route[each.key].id
  http_method      = "POST"
  authorization    = "NONE"
  api_key_required = each.value.api_key_required
}

resource "aws_api_gateway_method" "route_options" {
  for_each = local.routes

  rest_api_id      = aws_api_gateway_rest_api.this.id
  resource_id      = aws_api_gateway_resource.route[each.key].id
  http_method      = "OPTIONS"
  authorization    = "NONE"
  api_key_required = false
}

resource "aws_api_gateway_integration" "route_post" {
  for_each = local.routes

  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.route[each.key].id
  http_method             = aws_api_gateway_method.route_post[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.save_products.invoke_arn
}

resource "aws_api_gateway_integration" "route_options" {
  for_each = local.routes

  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.route[each.key].id
  http_method             = aws_api_gateway_method.route_options[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.save_products.invoke_arn
}

resource "aws_lambda_permission" "route_post" {
  for_each = local.routes

  statement_id  = "AllowApiGatewayPost${title(replace(each.key, "-", ""))}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.save_products.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/POST/api/${each.key}"
}

resource "aws_lambda_permission" "route_options" {
  for_each = local.routes

  statement_id  = "AllowApiGatewayOptions${title(replace(each.key, "-", ""))}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.save_products.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/OPTIONS/api/${each.key}"
}

# Request validation: reject a body that cannot possibly be a valid publish
# payload before Lambda runs. The handler still performs the full catalogue
# validation (schema.mjs), this is just a cheap first gate.
resource "aws_api_gateway_model" "save_products_request" {
  rest_api_id  = aws_api_gateway_rest_api.this.id
  name         = "SaveProductsRequest"
  description  = "products.json publish payload"
  content_type = "application/json"

  schema = jsonencode({
    "$schema" = "http://json-schema.org/draft-04/schema#"
    title     = "SaveProductsRequest"
    type      = "object"
    required  = ["products", "token"]
    properties = {
      products = { type = "array" }
      token    = { type = "string" }
      baseSha  = { type = "string" }
      force    = { type = "boolean" }
      notes    = { type = "string" }
    }
  })
}

resource "aws_api_gateway_request_validator" "body" {
  rest_api_id                 = aws_api_gateway_rest_api.this.id
  name                        = "body"
  validate_request_body       = true
  validate_request_parameters = false
}

resource "aws_api_gateway_method" "post" {
  rest_api_id      = aws_api_gateway_rest_api.this.id
  resource_id      = aws_api_gateway_resource.save_products.id
  http_method      = "POST"
  authorization    = "NONE"
  api_key_required = true

  request_models = {
    "application/json" = aws_api_gateway_model.save_products_request.name
  }
  request_validator_id = aws_api_gateway_request_validator.body.id
}

# Preflight is proxied to the Lambda, which answers 200 with the CORS headers
# needed for the x-api-key request header. API keys are not required on OPTIONS
# (browsers never send secrets on a preflight).
resource "aws_api_gateway_method" "options" {
  rest_api_id      = aws_api_gateway_rest_api.this.id
  resource_id      = aws_api_gateway_resource.save_products.id
  http_method      = "OPTIONS"
  authorization    = "NONE"
  api_key_required = false
}

resource "aws_api_gateway_integration" "post" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.save_products.id
  http_method             = aws_api_gateway_method.post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.save_products.invoke_arn
}

resource "aws_api_gateway_integration" "options" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.save_products.id
  http_method             = aws_api_gateway_method.options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.save_products.invoke_arn
}

resource "aws_api_gateway_method" "csp_report_post" {
  rest_api_id      = aws_api_gateway_rest_api.this.id
  resource_id      = aws_api_gateway_resource.csp_report.id
  http_method      = "POST"
  authorization    = "NONE"
  api_key_required = false
}

resource "aws_api_gateway_method" "csp_report_options" {
  rest_api_id      = aws_api_gateway_rest_api.this.id
  resource_id      = aws_api_gateway_resource.csp_report.id
  http_method      = "OPTIONS"
  authorization    = "NONE"
  api_key_required = false
}

resource "aws_api_gateway_integration" "csp_report_post" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.csp_report.id
  http_method             = aws_api_gateway_method.csp_report_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.save_products.invoke_arn
}

resource "aws_api_gateway_integration" "csp_report_options" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.csp_report.id
  http_method             = aws_api_gateway_method.csp_report_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.save_products.invoke_arn
}

resource "aws_lambda_permission" "post" {
  statement_id  = "AllowApiGatewayPost"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.save_products.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/POST/api/save-products"
}

resource "aws_lambda_permission" "options" {
  statement_id  = "AllowApiGatewayOptions"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.save_products.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/OPTIONS/api/save-products"
}

resource "aws_lambda_permission" "csp_report_post" {
  statement_id  = "AllowApiGatewayCspReportPost"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.save_products.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/POST/api/csp-report"
}

resource "aws_lambda_permission" "csp_report_options" {
  statement_id  = "AllowApiGatewayCspReportOptions"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.save_products.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/OPTIONS/api/csp-report"
}

# Gateway-generated responses (missing API key, throttling, quota, validation
# failure, integration error) bypass the Lambda, so CORS must be added here too
# or the browser sees an opaque network error instead of the real status.
# Every specific type that can be returned by this contract is covered; the
# DEFAULT_* types catch anything else.
locals {
  cors_gateway_response_types = toset([
    "DEFAULT_4XX",
    "DEFAULT_5XX",
    "THROTTLED",
    "QUOTA_EXCEEDED",
    "INVALID_API_KEY",
    "BAD_REQUEST_BODY",
    "MISSING_AUTHENTICATION_TOKEN",
  ])
}

resource "aws_api_gateway_gateway_response" "cors" {
  for_each      = local.cors_gateway_response_types
  rest_api_id   = aws_api_gateway_rest_api.this.id
  response_type = each.value

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Api-Key,Authorization'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
  }
}

resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  # API Gateway snapshots the API at deploy time, so every change to the method
  # contract must force a new deployment. Hashing the ids alone is not enough:
  # flipping api_key_required or editing the model keeps the same id.
  triggers = {
    redeployment = sha1(jsonencode({
      resources = [
        aws_api_gateway_resource.api.id,
        aws_api_gateway_resource.save_products.id,
        aws_api_gateway_resource.csp_report.id,
        aws_api_gateway_method.post.id,
        aws_api_gateway_method.options.id,
        aws_api_gateway_method.csp_report_post.id,
        aws_api_gateway_method.csp_report_options.id,
        aws_api_gateway_integration.post.id,
        aws_api_gateway_integration.options.id,
        aws_api_gateway_integration.csp_report_post.id,
        aws_api_gateway_integration.csp_report_options.id,
        aws_api_gateway_request_validator.body.id,
      ]
      route_resources = [for r in aws_api_gateway_resource.route : r.id]
      route_methods = concat(
        [for m in aws_api_gateway_method.route_post : m.id],
        [for m in aws_api_gateway_method.route_options : m.id]
      )
      route_integrations = concat(
        [for i in aws_api_gateway_integration.route_post : i.id],
        [for i in aws_api_gateway_integration.route_options : i.id]
      )
      gateway_responses = sort([
        for r in aws_api_gateway_gateway_response.cors : r.id
      ])
      api_key_required = aws_api_gateway_method.post.api_key_required
      model_schema     = aws_api_gateway_model.save_products_request.schema
    }))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_integration.post,
    aws_api_gateway_integration.options,
    aws_api_gateway_integration.csp_report_post,
    aws_api_gateway_integration.csp_report_options,
    aws_api_gateway_integration.route_post,
    aws_api_gateway_integration.route_options,
  ]
}

resource "aws_api_gateway_stage" "this" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  deployment_id = aws_api_gateway_deployment.this.id
  stage_name    = var.stage_name
  description   = "Production stage"
  tags          = var.tags

  dynamic "access_log_settings" {
    for_each = var.enable_access_logging ? [1] : []
    content {
      destination_arn = aws_cloudwatch_log_group.api_access[0].arn
      format = jsonencode({
        requestId          = "$context.requestId"
        extendedRequestId  = "$context.extendedRequestId"
        ip                 = "$context.identity.sourceIp"
        requestTime        = "$context.requestTime"
        httpMethod         = "$context.httpMethod"
        resourcePath       = "$context.resourcePath"
        status             = "$context.status"
        protocol           = "$context.protocol"
        responseLength     = "$context.responseLength"
        responseLatency    = "$context.responseLatency"
        integrationLatency = "$context.integrationLatency"
        apiKeyId           = "$context.identity.apiKeyId"
        errorMessage       = "$context.error.message"
      })
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.api_access,
    aws_api_gateway_account.this,
  ]
}

resource "aws_api_gateway_method_settings" "submit_enquiry" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  stage_name  = aws_api_gateway_stage.this.stage_name
  method_path = "api/submit-enquiry/POST"

  settings {
    metrics_enabled        = true
    logging_level          = "INFO"
    throttling_rate_limit  = var.public_rate_limit
    throttling_burst_limit = var.public_burst_limit
  }

  depends_on = [aws_api_gateway_stage.this]
}

# ---------------------------------------------------------------------------
# Rate limiting — usage plan + API key
# ---------------------------------------------------------------------------
resource "aws_api_gateway_api_key" "this" {
  name    = "${var.function_name}-key"
  enabled = true
  tags    = var.tags
}

resource "aws_api_gateway_usage_plan" "this" {
  name        = "${var.function_name}-plan"
  description = "Throttle and quota for the admin publish endpoint"
  tags        = var.tags

  api_stages {
    api_id = aws_api_gateway_rest_api.this.id
    stage  = aws_api_gateway_stage.this.stage_name
  }

  throttle_settings {
    burst_limit = var.burst_limit
    rate_limit  = var.rate_limit
  }

  dynamic "quota_settings" {
    for_each = var.monthly_quota > 0 ? [1] : []
    content {
      limit  = var.monthly_quota
      period = "MONTH"
    }
  }
}

resource "aws_api_gateway_usage_plan_key" "this" {
  key_id        = aws_api_gateway_api_key.this.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.this.id
}
