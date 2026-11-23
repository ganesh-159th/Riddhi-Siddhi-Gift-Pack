import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");

const tf = read("infra/modules/static-site/main.tf");
const cf = read("provision/cloudformation/site.yaml");
const verify = read("provision/cloudformation/verify-live-headers.sh");
const smoke = read("tests/cloudfront/admin-csp.spec.js");
const smokeConfig = read("playwright.cloudfront.config.js");

test("Terraform admin CSP pins the API origin and the site bucket host", () => {
  const admin = tf.split("csp_admin = join(")[1] || "";
  expect(admin).toContain("connect-src 'self' ${var.admin_api_origin} ${local.csp_admin_upload_origin};");
  expect(tf).toContain(
    'csp_admin_upload_origin = "https://${var.bucket_name}.s3.${data.aws_region.current.region}.amazonaws.com"'
  );
  expect(admin).not.toContain("*.");
});

test("CloudFormation admin CSP pins the same two origins", () => {
  const adminCsp =
    cf.split("\n").find((line) => line.includes("frame-src 'none'") && line.includes("connect-src")) || "";
  expect(adminCsp).toContain(
    "connect-src 'self' ${AdminApiOrigin} https://${BucketName}.s3.${AWS::Region}.amazonaws.com;"
  );
  expect(adminCsp).not.toContain("*.");
});

test("live verification and the CloudFront smoke check the admin CSP", () => {
  expect(verify).toContain("check_admin_connect_src");
  expect(smoke).toContain("securitypolicyviolation");
  expect(smoke).toContain("connect-src");
  expect(smokeConfig).toContain("ADMIN_API_ORIGIN");
});
