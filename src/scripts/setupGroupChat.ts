/**
 * Setup script to create MongoDB indexes for group chat
 * Run with: npx ts-node src/scripts/setupGroupChat.ts
 */

import { connect, disconnect } from 'mongoose';
import { GroupConversationModel } from '@models/groupConversation.model';
import { logger } from '@utils/logger';
import { DB_HOST, DB_PORT, DB_DATABASE } from '@config';

async function setupGroupChat() {
  try {
    // Connect to MongoDB
    const dbUrl = `${DB_HOST}/${DB_DATABASE}`;
    await connect(dbUrl);
    logger.info('Connected to MongoDB');

    // Create indexes for GroupConversation collection
    logger.info('Creating indexes for GroupConversation...');
    await GroupConversationModel.createIndexes();
    logger.info('✓ GroupConversation indexes created successfully');

    // Verify indexes
    const indexes = await GroupConversationModel.collection.getIndexes();
    logger.info('Current indexes:', indexes);

    logger.info('✓ Group chat setup completed successfully!');
  } catch (error) {
    logger.error('Setup failed:', error);
    process.exit(1);
  } finally {
    await disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

// Run setup
setupGroupChat();
