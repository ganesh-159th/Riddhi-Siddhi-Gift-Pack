output "invoke_url" {
  value       = "${aws_api_gateway_stage.this.invoke_url}/api/save-products"
  description = "Set this as the AWS_API_URL GitHub variable (frontend VITE_AWS_API_URL)."
}

output "api_key" {
  value       = aws_api_gateway_api_key.this.value
  description = "Set this as the AWS_API_KEY GitHub secret (frontend VITE_AWS_API_KEY)."
  sensitive   = true
}

output "api_id" {
  value       = aws_api_gateway_rest_api.this.id
  description = "REST API id."
}

output "api_name" {
  value       = aws_api_gateway_rest_api.this.name
  description = "REST API name, used as the ApiName CloudWatch dimension."
}

output "stage_name" {
  value       = aws_api_gateway_stage.this.stage_name
  description = "Deployed stage name, used as the Stage CloudWatch dimension."
}

output "api_access_log_group_name" {
  value       = try(aws_cloudwatch_log_group.api_access[0].name, "")
  description = "CloudWatch log group receiving API Gateway access logs (empty when disabled)."
}

output "function_name" {
  value       = aws_lambda_function.save_products.function_name
  description = "Lambda function name."
}

output "function_arn" {
  value       = aws_lambda_function.save_products.arn
  description = "Lambda function ARN."
}

output "log_group_name" {
  value       = aws_cloudwatch_log_group.lambda.name
  description = "CloudWatch log group to tail for structured invocation logs."
}
