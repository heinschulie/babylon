import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { existsSync } from "fs";
import { resolve, basename, isAbsolute } from "path";
import type { Logger } from "./logger";

export class R2Uploader {
  enabled = false;
  private client: S3Client | null = null;
  private bucketName: string | null = null;
  private publicDomain: string | null = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.initialize();
  }

  private initialize(): void {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucketName = process.env.R2_BUCKET_NAME ?? null;
    this.publicDomain = process.env.R2_PUBLIC_DOMAIN ?? null;

    if (!accountId || !accessKeyId || !secretAccessKey || !this.bucketName) {
      this.logger.info("R2 upload disabled — missing required environment variables");
      return;
    }

    try {
      this.client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.enabled = true;
      this.logger.info(`R2 upload enabled — bucket: ${this.bucketName}${this.publicDomain ? `, domain: ${this.publicDomain}` : ""}`);
    } catch (e) {
      this.logger.warn(`Failed to initialize R2 client: ${e}`);
      this.enabled = false;
    }
  }

  async uploadFile(filePath: string, objectKey?: string): Promise<string | null> {
    if (!this.enabled || !this.client || !this.bucketName) return null;

    const absPath = isAbsolute(filePath) ? filePath : resolve(filePath);
    if (!existsSync(absPath)) {
      this.logger.warn(`File not found: ${absPath}`);
      return null;
    }

    const key = objectKey ?? `adw/review/${basename(absPath)}`;

    try {
      const body = await Bun.file(absPath).arrayBuffer();
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: new Uint8Array(body),
      }));
      this.logger.info(`Uploaded ${absPath} to R2 as ${key}`);

      if (this.publicDomain) {
        return `https://${this.publicDomain}/${key}`;
      }
      return `https://${this.bucketName}.r2.dev/${key}`;
    } catch (e) {
      this.logger.error(`Failed to upload ${absPath} to R2: ${e}`);
      return null;
    }
  }

  async uploadScreenshots(
    screenshots: string[],
    adwId: string
  ): Promise<Record<string, string>> {
    const mapping: Record<string, string> = {};

    for (const screenshotPath of screenshots) {
      if (!screenshotPath) continue;

      const key = `adw/${adwId}/review/${basename(screenshotPath)}`;
      const publicUrl = await this.uploadFile(screenshotPath, key);
      mapping[screenshotPath] = publicUrl ?? screenshotPath;
    }

    return mapping;
  }
}
