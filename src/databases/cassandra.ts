import cassandra from 'cassandra-driver';
import { CASSANDRA_CONTACT_POINTS, CASSANDRA_LOCAL_DATA_CENTER, CASSANDRA_KEYSPACE } from '@config';
import { logger } from '@utils/logger';

const contactPoints = (CASSANDRA_CONTACT_POINTS || '127.0.0.1').split(',').map(p => p.trim());
const localDataCenter = CASSANDRA_LOCAL_DATA_CENTER || 'datacenter1';
const keyspace = CASSANDRA_KEYSPACE || 'talkapp';

export const cassandraClient = new cassandra.Client({
  contactPoints,
  localDataCenter,
  keyspace,
});

export async function initCassandra(): Promise<void> {
  const bootstrapClient = new cassandra.Client({
    contactPoints,
    localDataCenter,
  });

  try {
    await bootstrapClient.connect();

    await bootstrapClient.execute(`
      CREATE KEYSPACE IF NOT EXISTS ${keyspace}
      WITH replication = {'class': 'SimpleStrategy', 'replication_factor': '1'}
      AND durable_writes = true
    `);

    await bootstrapClient.execute(`
      CREATE TABLE IF NOT EXISTS ${keyspace}.messages (
        room_id   TEXT,
        created_at TIMESTAMP,
        message_id UUID,
        sender_id  TEXT,
        reciever_id TEXT,
        content    TEXT,
        is_binary  BOOLEAN,
        PRIMARY KEY ((room_id), created_at, message_id)
      ) WITH CLUSTERING ORDER BY (created_at DESC)
    `);

    logger.info('Cassandra keyspace and messages table ready');
  } finally {
    await bootstrapClient.shutdown();
  }

  await cassandraClient.connect();
  logger.info('Cassandra client connected');
}

export async function shutdownCassandra(): Promise<void> {
  await cassandraClient.shutdown();
  logger.info('Cassandra client disconnected');
}
