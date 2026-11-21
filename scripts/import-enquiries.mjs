import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const file = process.argv[2];
const bucket = process.env.ENQUIRIES_BUCKET;

if (!file || !bucket) {
  console.error("Usage: ENQUIRIES_BUCKET=<private-bucket> npm run import:enquiries -- <netlify-enquiries.csv>");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((v) => v !== "")) rows.push(row);

  const headers = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  return rows.map((cells) =>
    Object.fromEntries(headers.map((h, i) => [h, (cells[i] || "").trim()]))
  );
}

const value = (row, ...names) => {
  for (const name of names) {
    if (row[name]) return row[name].trim();
  }
  return "";
};

const csv = await readFile(file, "utf8");
const rows = parseCsv(csv).filter(
  (row) => !value(row, "form name", "form_name", "form-name") ||
    value(row, "form name", "form_name", "form-name").toLowerCase() === "enquiry"
);

if (!rows.length) {
  console.error("No enquiry rows found in " + file);
  process.exit(1);
}

const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });
let imported = 0;

for (const row of rows) {
  const id =
    value(row, "id", "submission id", "submission_id") ||
    createHash("sha256").update(JSON.stringify(row)).digest("hex").slice(0, 32);

  const submittedAt = value(row, "submitted at", "created_at", "date");
  const day = (Date.parse(submittedAt) ? new Date(submittedAt) : new Date()).toISOString().slice(0, 10);
  const enquiry = {
    id,
    form: "enquiry",
    source: "netlify-import",
    submittedAt: submittedAt || null,
    name: value(row, "name", "business name"),
    phone: value(row, "phone", "mobile", "contact"),
    product: value(row, "product"),
    quantity: value(row, "quantity"),
    message: value(row, "message", "enquiry"),
  };

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `enquiries/imported/${day}/${id}.json`,
      Body: JSON.stringify(enquiry, null, 2),
      ContentType: "application/json",
    })
  );
  imported++;
}

console.log(`Imported ${imported} enquiry submissions into s3://${bucket}/enquiries/imported/`);
