output "backup_bucket_name" {
  value       = aws_s3_bucket.backups.id
  description = "Name of the private backup bucket."
}

output "backup_bucket_arn" {
  value       = aws_s3_bucket.backups.arn
  description = "ARN of the private backup bucket."
}

output "function_name" {
  value       = aws_lambda_function.backup.function_name
  description = "Name of the scheduled backup Lambda."
}

output "schedule_rule_name" {
  value       = aws_cloudwatch_event_rule.backup.name
  description = "EventBridge rule that runs the backup."
}

output "alarm_names" {
  value       = [aws_cloudwatch_metric_alarm.backup_errors.alarm_name, aws_cloudwatch_metric_alarm.backup_not_running.alarm_name]
  description = "Alarms that report backup failures."
}
