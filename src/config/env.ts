// import { cleanEnv, str, num, bool, url } from 'envalid';

// export const env = cleanEnv(process.env, {
//   // Environment
//   NODE_ENV: str({ choices: ['development', 'staging', 'production'], default: 'development' }),
//   PORT: num({ default: 8000 }),
//   LOG_LEVEL: str({ choices: ['error', 'warn', 'info', 'debug'], default: 'info' }),

//   // Database - MongoDB
//   MONGODB_URI: str(),
//   MONGODB_REPLICA_SET: str({ default: 'rs0' }),

//   // Database - Cassandra
//   CASSANDRA_CONTACT_POINTS: str(),
//   CASSANDRA_KEYSPACE: str({ default: 'talkapp' }),
//   CASSANDRA_USERNAME: str({ default: '' }),
//   CASSANDRA_PASSWORD: str({ default: '' }),

//   // Database - Redis
//   REDIS_NODES: str(),
//   REDIS_PASSWORD: str({ default: '' }),
//   REDIS_DB: num({ default: 0 }),

//   // JWT
//   JWT_PRIVATE_KEY: str(),
//   JWT_PUBLIC_KEY: str(),
//   JWT_EXPIRY: str({ default: '24h' }),
//   JWT_REFRESH_EXPIRY: str({ default: '7d' }),

//   // Translation Services
//   DEEPL_API_KEY: str(),
//   LIBRETRANSLATE_URL: url({ default: 'http://localhost:5000' }),
//   LIBRETRANSLATE_API_KEY: str({ default: '' }),

//   // Firebase
//   FIREBASE_SERVICE_ACCOUNT_JSON: str(),
//   FIREBASE_PROJECT_ID: str(),

//   // APNs
//   APNS_CERTIFICATE: str({ default: '' }),
//   APNS_KEY: str({ default: '' }),
//   APNS_TEAM_ID: str({ default: '' }),
//   APNS_KEY_ID: str({ default: '' }),
//   APNS_BUNDLE_ID: str({ default: '' }),

//   // AWS S3
//   AWS_S3_BUCKET: str(),
//   AWS_S3_REGION: str({ default: 'us-east-1' }),
//   AWS_ACCESS_KEY_ID: str(),
//   AWS_SECRET_ACCESS_KEY: str(),
//   AWS_S3_ENDPOINT: str({ default: '' }),

//   // Cloudflare
//   CLOUDFLARE_ACCOUNT_ID: str({ default: '' }),
//   CLOUDFLARE_API_TOKEN: str({ default: '' }),
//   CLOUDFLARE_ZONE_ID: str({ default: '' }),

//   // Qdrant
//   QDRANT_URL: url(),
//   QDRANT_API_KEY: str(),
//   QDRANT_COLLECTION: str({ default: 'messages' }),

//   // Rate Limiting
//   RATE_LIMIT_WINDOW_MS: num({ default: 60000 }),
//   RATE_LIMIT_MAX_REQUESTS: num({ default: 1000 }),

//   // CORS
//   ORIGIN: str({ default: 'http://localhost:3000' }),
//   CREDENTIALS: bool({ default: true }),

//   // Logging
//   LOG_DIR: str({ default: './logs' }),
//   LOG_MAX_SIZE: str({ default: '20m' }),
//   LOG_MAX_FILES: str({ default: '14d' }),

//   // Monitoring
//   PROMETHEUS_ENABLED: bool({ default: true }),
//   DATADOG_ENABLED: bool({ default: false }),
//   DATADOG_API_KEY: str({ default: '' }),
//   DATADOG_APP_KEY: str({ default: '' }),

//   // Feature Flags
//   ENABLE_SOCKET_IO: bool({ default: true }),
//   ENABLE_HEALTH_CHECK: bool({ default: true }),
//   ENABLE_METRICS: bool({ default: true }),
// });
