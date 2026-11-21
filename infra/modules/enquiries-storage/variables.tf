variable "bucket_name" {
  type        = string
  description = "Globally unique name of the private bucket that stores contact form submissions."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to the bucket."
  default     = {}
}
