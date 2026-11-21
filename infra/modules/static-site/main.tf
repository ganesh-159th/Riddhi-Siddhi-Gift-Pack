# Riddhi Siddhi Gift & Pack — static site (S3 + CloudFront).
#
# Terraform mirror of provision/cloudformation/site.yaml (the resources behind
# it were adopted into the "riddhi-site" stack). Everything here stays inside
# the AWS free tier: no Lambda, no API Gateway, no WAF, no Route 53. See
# infra/README.md and README "Cost & budget guardrails".
#
# CloudFront Functions only exist in us-east-1, so this module takes a
# us_east_1 provider alias for the two functions. All other resources follow
# the default provider (ap-south-1 for the live site).

resource "aws_s3_bucket" "site" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy
  tags          = var.tags
}

# Accidental delete/overwrite of products.json or a product photo is recoverable
# from a previous version. Enabling versioning is free; the accompanying
# lifecycle rules below bound how long noncurrent versions and delete markers
# are kept, so storage cannot grow without limit.
resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Presigned browser uploads (presign-image -> PUT straight to S3) need CORS.
# Ported verbatim from the live bucket so uploads keep working.
resource "aws_s3_bucket_cors_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = compact(
      concat(
        ["https://${var.cdn_domain}", "http://localhost:3000"],
        var.custom_domain != "" ? ["https://${var.custom_domain}"] : [],
      )
    )
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Rollback snapshots are the single biggest source of S3 PUT operations. Seven
# days matches the window deploy.yml can actually roll back within; anything
# older is guaranteed to be dead weight. Do NOT add a GLACIER transition — both
# Glacier storage classes carry minimum durations with no free-tier allowance.
resource "aws_s3_bucket_lifecycle_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    id     = "DeleteOldRollbacks"
    status = "Enabled"
    filter {
      prefix = "rollbacks/"
    }
    expiration {
      days = var.rollback_retention_days
    }
  }
  # Expiring a versioned object leaves a delete marker behind. Without this
  # rule the bucket would slowly fill with markers that protect nothing.
  # ExpiredObjectDeleteMarker only removes a marker when no versions remain.
  rule {
    id     = "DeleteExpiredDeleteMarkers"
    status = "Enabled"
    filter {
      prefix = ""
    }
    expiration {
      expired_object_delete_marker = true
    }
  }

  # Bounds versioning storage. 30 days is enough to undo a bad admin publish or
  # a mistaken delete, without keeping every historical copy of an image.
  # Deliberately NO transition to Glacier: minimum storage durations there are
  # billed even after the data is deleted (see README "Cost & budget guardrails").
  rule {
    id     = "ExpireNoncurrentVersions"
    status = "Enabled"
    filter {
      prefix = ""
    }
    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_retention_days
    }
  }

  rule {
    id     = "AbortIncompleteMultipartUploads"
    status = "Enabled"
    filter {
      prefix = ""
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# OAC keeps the bucket private; this policy is the only way CloudFront can read
# objects, and it is scoped to this distribution (aws:SourceArn).
resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.origin_access.json
}

# S3 server access logging (issue #39). The target is the central log bucket
# created by the log-storage module; its bucket policy grants the S3 logging
# service principal write access.
resource "aws_s3_bucket_logging" "site" {
  count = var.server_access_logs_bucket != "" ? 1 : 0

  bucket        = aws_s3_bucket.site.id
  target_bucket = var.server_access_logs_bucket
  target_prefix = var.server_access_logs_prefix
}

data "aws_iam_policy_document" "origin_access" {
  statement {
    sid    = "AllowCloudFrontOriginAccess"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "riddhi-s3-oac"
  description                       = "OAC for Riddhi Siddhi S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Appends index.html to directory-style URLs (the site is a static build, so
# /collections/ must resolve to /collections/index.html). us-east-1 only.
resource "aws_cloudfront_function" "index_rewrite" {
  provider = aws.us_east_1

  name    = "index-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Append index.html for trailing-slash paths"
  publish = true
  code    = <<-EOT
    function handler(event) {
        var request = event.request;
        var uri = request.uri;
        if (uri === "/" || uri.endsWith("/")) {
            request.uri = uri + "index.html";
        }
        return request;
    }
  EOT
}

locals {
  csp_report_directive = var.csp_report_uri != "" ? " report-uri ${var.csp_report_uri};" : ""
  csp_public = join(" ", [
    "default-src 'self';",
    "base-uri 'self';",
    "object-src 'none';",
    "frame-ancestors 'none';",
    "form-action 'self';",
    "script-src 'self' 'sha256-/FJnHy2CGGOeIvkDC7eAFRc0uChU+dX1u6kGp3hLFeY=' 'sha256-bg3x1TEm9BoDXLXO5rAhMUXV/KJxxaq62WowoWP9e5I=' 'sha256-1L4hjMX+eDVyE+TFI8sDl4GsQT3bagbNBNguhlOg1bw=' https://www.googletagmanager.com https://connect.facebook.net;",
    "style-src 'self' 'sha256-caYMD6dyE/5B5P/vNbWFURYhm+9XrU5Ece7ivqHL3IU=' https://fonts.googleapis.com;",
    "font-src 'self' https://fonts.gstatic.com data:;",
    "img-src 'self' data: blob: https:;",
    "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://connect.facebook.net https://www.facebook.com https://*.s3.ap-south-1.amazonaws.com https://*.execute-api.ap-south-1.amazonaws.com;",
    "frame-src 'self' https://www.google.com https://maps.google.com;",
    "worker-src 'self' blob:;",
    "manifest-src 'self';",
    "media-src 'self' blob:;",
    "upgrade-insecure-requests;${local.csp_report_directive}",
  ])
  csp_admin = join(" ", [
    "default-src 'self';",
    "base-uri 'self';",
    "object-src 'none';",
    "frame-ancestors 'none';",
    "form-action 'self';",
    "script-src 'self';",
    "style-src 'self';",
    "font-src 'self' data:;",
    "img-src 'self' data: blob: https:;",
    "connect-src 'self' https://*.s3.ap-south-1.amazonaws.com https://*.execute-api.ap-south-1.amazonaws.com;",
    "frame-src 'none';",
    "worker-src 'self' blob:;",
    "manifest-src 'self';",
    "media-src 'self' blob:;",
    "upgrade-insecure-requests;${local.csp_report_directive}",
  ])
}

# Permissions-Policy is the one netlify.toml header CloudFront's response
# headers policy cannot express, so it rides on a viewer-response function.
# The value MUST be an object ({ value: ... }), not a bare string — a bare
# string makes CloudFront reject the response as "invalid data" (503s).
resource "aws_cloudfront_function" "permissions_policy" {
  provider = aws.us_east_1

  name    = "permissions-policy"
  runtime = "cloudfront-js-2.0"
  comment = "Adds Permissions-Policy, which CloudFront headers policies cannot set"
  publish = true
  code    = <<-EOT
    function handler(event) {
        var response = event.response;
        if (response && response.headers) {
            response.headers["permissions-policy"] = {
                value: "camera=(), microphone=(), geolocation=()"
            };
        }
        return response;
    }
  EOT
}

# Replicates the legacy ForwardedValues TTLs byte-for-byte so adopting this
# cannot change what the edge serves. Origin Cache-Control still wins, which is
# how deploy.yml sets immutable on /images and /products and no-store on the
# key pages.
resource "aws_cloudfront_cache_policy" "site" {
  name        = "RiddhiSiteCachePolicy"
  comment     = "MinTTL 0 / DefaultTTL 3600 / MaxTTL 31536000 (matches legacy ForwardedValues)"
  default_ttl = 3600
  max_ttl     = 31536000
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# An S3 origin behind sigv4/always OAC needs nothing forwarded: no cookies, no
# query string, no headers.
resource "aws_cloudfront_origin_request_policy" "site" {
  name    = "RiddhiSiteOriginRequestPolicy"
  comment = "Forward nothing to the S3 origin"

  cookies_config {
    cookie_behavior = "none"
  }
  headers_config {
    header_behavior = "none"
  }
  query_strings_config {
    query_string_behavior = "none"
  }
}

# Security headers ported from netlify.toml [[headers]] for = "/*". These were
# live on Netlify and are MISSING on the CloudFront site today, so this policy
# is a real security fix, not just config hygiene.
resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "RiddhiSecurityHeaders"
  comment = "Ported from netlify.toml + CSP hardening (issues #43, #24)"

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_security_policy {
      content_security_policy = local.csp_public
      override                = true
    }
  }
}

# Admin gets stricter headers than the public site: noindex, tighter CSP, and
# no-referrer. CloudFront allows one response headers policy per behavior, so
# this policy combines admin-specific and baseline security headers.
resource "aws_cloudfront_response_headers_policy" "admin" {
  name    = "RiddhiAdminSecurityHeaders"
  comment = "Admin security headers (issue #24)"

  custom_headers_config {
    items {
      header   = "X-Robots-Tag"
      value    = "noindex, nofollow"
      override = true
    }
  }

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_security_policy {
      content_security_policy = local.csp_admin
      override                = true
    }
  }
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "Riddhi Siddhi Gift & Pack production"
  price_class         = var.price_class
  http_version        = "http2"
  aliases             = var.custom_domain != "" ? [var.custom_domain] : []
  tags                = var.tags

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "s3-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  default_cache_behavior {
    target_origin_id           = "s3-origin"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.site.id
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.site.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.index_rewrite.arn
    }
    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.permissions_policy.arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/admin.html*"
    target_origin_id           = "s3-origin"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.site.id
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.site.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.admin.id

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.permissions_policy.arn
    }
  }

  # S3 returns 403 (not 404) for objects missing from a private bucket, so 403
  # has to map to the branded page too or blank-origin paths render as a raw
  # 403 instead of the 404 page.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 0
  }
  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 0
  }
  custom_error_response {
    error_code            = 500
    response_code         = 500
    response_page_path    = "/404.html"
    error_caching_min_ttl = 300
  }
  custom_error_response {
    error_code            = 502
    response_code         = 502
    response_page_path    = "/404.html"
    error_caching_min_ttl = 300
  }
  custom_error_response {
    error_code            = 503
    response_code         = 503
    response_page_path    = "/404.html"
    error_caching_min_ttl = 300
  }
  custom_error_response {
    error_code            = 504
    response_code         = 504
    response_page_path    = "/404.html"
    error_caching_min_ttl = 300
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.acm_certificate_arn == ""
    acm_certificate_arn            = var.acm_certificate_arn != "" ? var.acm_certificate_arn : null
    ssl_support_method             = var.acm_certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version       = var.acm_certificate_arn != "" ? "TLSv1.2_2021" : "TLSv1"
  }
}