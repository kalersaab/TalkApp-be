import { config } from 'dotenv';
config({ path: `.env.${process.env.NODE_ENV || 'development'}.local` });

export const CREDENTIALS = process.env.CREDENTIALS === 'true';
export const {
  NODE_ENV,
  PORT,
  // MongoDB
  DB_HOST,
  DB_PORT,
  DB_DATABASE,
  // Auth — legacy HS256 key kept for backward compat during migration
  SECRET_KEY,
  // Auth — RS256 asymmetric keys (preferred)
  JWT_PRIVATE_KEY,   // PEM, base64-encoded in env
  JWT_PUBLIC_KEY,    // PEM, base64-encoded in env
  JWT_ACCESS_EXPIRY, // default '15m'
  JWT_REFRESH_EXPIRY,// default '30d'
  // Google OAuth
  GOOGLE_CLIENT_ID,
  // Apple Sign-In
  APPLE_APP_BUNDLE_ID,
  // Logging
  LOG_FORMAT,
  LOG_DIR,
  // CORS
  ORIGIN,
  // Cassandra
  CASSANDRA_CONTACT_POINTS,
  CASSANDRA_LOCAL_DC,
  CASSANDRA_KEYSPACE,
  CASSANDRA_USER,
  CASSANDRA_PASSWORD,
  // Redis
  REDIS_MODE,
  REDIS_NODES,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  REDIS_KEY_PREFIX,
  // Qdrant
  QDRANT_URL,          // e.g. http://localhost:6333
  QDRANT_API_KEY,      // optional, for Qdrant Cloud
  QDRANT_COLLECTION,   // default 'user_bios'
  // AWS S3
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_S3_BUCKET,
  AWS_S3_CDN_URL,      // CloudFront or S3 public URL base
  // Translation — DeepL
  DEEPL_API_KEY,       // DeepL free or pro API key
  DEEPL_API_FREE,      // 'true' = use api-free.deepl.com (default), 'false' = pro
  // Translation — LibreTranslate fallback
  LIBRETRANSLATE_URL,  // e.g. http://localhost:5000
  LIBRETRANSLATE_KEY,  // optional API key
  // FCM (Firebase Cloud Messaging — Android)
  FCM_PROJECT_ID,
  FCM_CLIENT_EMAIL,
  FCM_PRIVATE_KEY,     // base64-encoded PEM
  // APNs (Apple Push Notification service — iOS)
  APNS_KEY_ID,         // 10-char key ID from Apple Developer
  APNS_TEAM_ID,        // 10-char team ID
  APNS_KEY_PATH,       // path to .p8 file (dev only)
  APNS_KEY_BASE64,     // base64-encoded .p8 content (production)
  APNS_BUNDLE_ID,      // e.g. com.yourcompany.talkapp
  APNS_PRODUCTION,     // 'true' for production APNs gateway
} = process.env;
