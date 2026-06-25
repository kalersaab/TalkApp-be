import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_S3_CDN_URL } from '@config';
import { logger } from '@utils/logger';

let s3: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: AWS_REGION ?? 'us-east-1',
      credentials:
        AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY ? { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } : undefined, // falls back to IAM role in production
    });
  }
  return s3;
}

export async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<string> {
  const bucket = AWS_S3_BUCKET ?? 'talkapp-media';
  const cdnBase = (AWS_S3_CDN_URL ?? `https://${bucket}.s3.amazonaws.com`).replace(/\/$/, '');

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  const url = `${cdnBase}/${key}`;
  logger.debug(`[S3] Uploaded ${key} → ${url}`);
  return url;
}
