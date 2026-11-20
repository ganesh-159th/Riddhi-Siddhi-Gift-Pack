import { describe, expect, test, vi, beforeEach } from "vitest";

const { calls, responses } = vi.hoisted(() => ({
  calls: [],
  responses: {},
}));

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    S3Client: class {
      send(command) {
        calls.push(command);
        const key = Object.getPrototypeOf(command).constructor.name;
        const reply = responses[key];
        return reply ? reply(command) : Promise.resolve({});
      }
    },
    GetObjectCommand: class GetObjectCommand extends Command {},
    ListObjectsV2Command: class ListObjectsV2Command extends Command {},
    CopyObjectCommand: class CopyObjectCommand extends Command {},
    PutObjectCommand: class PutObjectCommand extends Command {},
  };
});

const handlerModule = () => import("../lambda/backup-products/index.mjs");

const commands = (name) => calls.filter((call) => call.constructor.name === name);

beforeEach(() => {
  calls.length = 0;
  process.env.SOURCE_BUCKET = "site-bucket";
  process.env.BACKUP_BUCKET = "backup-bucket";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-19T03:00:00Z"));

  responses.GetObjectCommand = () =>
    Promise.resolve({
      ETag: '"abc123"',
      Body: {
        transformToByteArray: async () =>
          Buffer.from(JSON.stringify({ products: [{ id: "ring" }] })),
      },
    });
  responses.ListObjectsV2Command = (command) => {
    if (command.input.Bucket === "site-bucket") {
      return Promise.resolve({
        Contents: [{ Key: "products/ring.jpg", ETag: '"img1"', Size: 42 }],
        IsTruncated: false,
      });
    }
    return Promise.resolve({ Contents: [], IsTruncated: false });
  };
});

describe("backup-products Lambda", () => {
  test("snapshots products.json and copies only missing images", async () => {
    const { handler } = await handlerModule();
    const result = await handler();

    expect(result.snapshot).toBe(
      "s3://backup-bucket/products/2026-11-19/products.json"
    );
    expect(result.imageCount).toBe(1);
    expect(result.imagesCopied).toBe(1);

    const puts = commands("PutObjectCommand").map((call) => call.input);
    expect(puts.map((input) => input.Key)).toEqual([
      "products/2026-11-19/products.json",
      "products/2026-11-19/manifest.json",
    ]);
    expect(puts[0].ServerSideEncryption).toBe("AES256");

    const copies = commands("CopyObjectCommand").map((call) => call.input);
    expect(copies).toEqual([
      {
        Bucket: "backup-bucket",
        Key: "images/ring.jpg",
        CopySource: "site-bucket/products/ring.jpg",
        MetadataDirective: "COPY",
        ServerSideEncryption: "AES256",
      },
    ]);
  });

  test("skips images whose ETag and size already match", async () => {
    responses.ListObjectsV2Command = (command) =>
      Promise.resolve(
        command.input.Bucket === "site-bucket"
          ? {
              Contents: [{ Key: "products/ring.jpg", ETag: '"img1"', Size: 42 }],
              IsTruncated: false,
            }
          : {
              Contents: [{ Key: "images/ring.jpg", ETag: '"img1"', Size: 42 }],
              IsTruncated: false,
            }
      );

    const { handler } = await handlerModule();
    const result = await handler();

    expect(result.imagesCopied).toBe(0);
    expect(commands("CopyObjectCommand")).toHaveLength(0);
  });

  test("refuses to snapshot a corrupt catalogue", async () => {
    responses.GetObjectCommand = () =>
      Promise.resolve({
        ETag: '"bad"',
        Body: {
          transformToByteArray: async () => Buffer.from('{"products":"oops"}'),
        },
      });

    const { handler } = await handlerModule();
    await expect(handler()).rejects.toThrow(/no products array/);
    expect(commands("PutObjectCommand")).toHaveLength(0);
  });
});
