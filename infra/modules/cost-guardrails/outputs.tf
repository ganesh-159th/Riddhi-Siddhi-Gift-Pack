output "cost_alert_topic_arn" {
  value       = aws_sns_topic.cost.arn
  description = "ARN of the SNS topic receiving budget alerts"
}

output "monthly_budget_arn" {
  value       = aws_budgets_budget.monthly.arn
  description = "ARN of the monthly spend budget"
}