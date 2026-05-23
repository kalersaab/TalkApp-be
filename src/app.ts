import { join } from 'path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import morgan from 'morgan';
import { connect, set, disconnect } from 'mongoose';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import uWS, { TemplatedApp, WebSocket, HttpRequest, HttpResponse, us_socket_context_t } from 'uWebSockets.js';
import { NODE_ENV, PORT, LOG_FORMAT, ORIGIN, CREDENTIALS } from '@config';
import { dbConnection } from '@databases';
import { initCassandra, shutdownCassandra } from '@databases/cassandra';
import { Routes } from '@interfaces/routes.interface';
import errorMiddleware from '@middlewares/error.middleware';
import { MessageService } from '@services/message.service';
import { logger, stream } from '@utils/logger';

class App {
  public app: express.Application;
  public uws: TemplatedApp;
  public env: string;
  public port: string | number;
  public wsPort: number;
  private messageService = new MessageService();
  private clients = new Map<string, WebSocket<unknown>>();

  constructor(routes: Routes[]) {
    this.app = express();
    this.env = NODE_ENV || 'development';
    this.port = PORT || 3000;
    this.wsPort = Number(this.port) + 1;

    this.uws = uWS.App();
    this.initializeWebSocket();

    this.connectToDatabase();
    this.connectToCassandra();
    this.initializeMiddlewares();
    this.initializeRoutes(routes);
    this.initializeSwagger();
    this.initializeErrorHandling();
  }

  public listen() {
    this.app.listen(this.port, () => {
      logger.info(`=================================`);
      logger.info(`======= ENV: ${this.env} =======`);
      logger.info(`🚀 App listening on the port ${this.port}`);
      logger.info(`=================================`);
    });

    this.uws.listen(this.wsPort, token => {
      if (token) {
        logger.info(`=================================`);
        logger.info(`⚡ uWebSockets listening on port ${this.wsPort}`);
        logger.info(`=================================`);
      } else {
        logger.error(`Failed to start uWebSockets on port ${this.wsPort}`);
      }
    });
  }

  public async closeDatabaseConnection(): Promise<void> {
    try {
      await disconnect();
      console.log('Disconnected from MongoDB');
    } catch (error) {
      console.error('Error closing database connection:', error);
    }
  }

  public async closeCassandraConnection(): Promise<void> {
    try {
      await shutdownCassandra();
    } catch (error) {
      console.error('Error closing Cassandra connection:', error);
    }
  }

  public getServer() {
    return this.app;
  }

  public getUws() {
    return this.uws;
  }

  private initializeWebSocket() {
    this.uws.ws<{ userId: string }>('/ws', {
      compression: uWS.SHARED_COMPRESSOR,
      maxPayloadLength: 16 * 1024 * 1024, // 16 MB
      idleTimeout: 60,

      upgrade: (res: HttpResponse, req: HttpRequest, context: us_socket_context_t) => {
        const userId = req.getQuery('userId') || 'anonymous';
        res.onAborted(() => {
          logger.info(`WebSocket upgrade aborted for userId: ${userId}`);
        });
        res.upgrade(
          { userId },
          req.getHeader('sec-websocket-key'),
          req.getHeader('sec-websocket-protocol'),
          req.getHeader('sec-websocket-extensions'),
          context,
        );
      },
      open: (ws: WebSocket<{ userId: string }>) => {
        const { userId } = ws.getUserData();
        this.clients.set(userId, ws as unknown as WebSocket<unknown>);
        logger.info(`WebSocket client connected: ${userId}`);
        ws.subscribe('broadcast');
      },

      message: (ws: WebSocket<{ userId: string }>, message: ArrayBuffer, isBinary: boolean) => {
        const senderId = ws.getUserData().userId;
        if (isBinary) {
          const content = Buffer.from(message).toString('base64');
          const roomId = senderId;
          this.messageService.saveMessage(senderId, roomId, null, content, true).catch(err => {
            logger.error(`Failed to save binary message: ${err.message}`);
          });
          return;
        }
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(Buffer.from(message).toString('utf-8'));
        } catch {
          logger.warn(`Non-JSON text message from ${senderId}, ignoring`);
          return;
        }

        const type = (parsed.type as string) ?? 'message';
        if (type === 'getHistory') {
          const peerId = parsed.peerId as string | undefined;
          const limit = typeof parsed.limit === 'number' ? parsed.limit : 50;

          if (!peerId) {
            ws.send(JSON.stringify({ type: 'error', message: 'peerId is required for getHistory' }), false);
            return;
          }
          const roomId = [senderId, peerId].sort().join('_');
          this.messageService.getMessages(roomId, senderId, limit)
            .then(messages => {
              ws.send(JSON.stringify({ type: 'history', roomId, messages }), false);
            })
            .catch(err => {
              logger.error(`Failed to fetch history for room ${roomId}: ${err.message}`);
              ws.send(JSON.stringify({ type: 'error', message: 'Failed to fetch message history' }), false);
            });

          return;
        }

        const receiverId = (parsed.receiverId as string) ?? null;
        const textContent = (parsed.content as string) ?? '';
         const roomId = receiverId
          ? [senderId, receiverId].sort().join('_')
          : senderId;

        this.messageService.saveMessage(senderId, roomId, receiverId, textContent, false).catch(err => {
          logger.error(`Failed to save message to Cassandra: ${err.message}`);
        });

        if (receiverId) {
          const recipientWs = this.clients.get(receiverId);
          if (recipientWs) {
            recipientWs.send(JSON.stringify({
              type: 'message',
              senderId,
              roomId,
              content: textContent,
              timestamp: new Date().toISOString(),
            }), false);
          } else {
            logger.info(`Recipient ${receiverId} is not connected`);
          }
        }
      },

      close: (ws: WebSocket<{ userId: string }>, code: number, _message: ArrayBuffer) => {
        const { userId } = ws.getUserData();
        this.clients.delete(userId);
        logger.info(`WebSocket client ${userId} disconnected [${code}]`);
      },
    });

    this.uws.get('/health', (res: HttpResponse, _req: HttpRequest) => {
      res.end('uWebSockets OK');
    });
  }

  private async connectToDatabase() {
    if (this.env !== 'production') {
      set('debug', true);
    }

    await connect(dbConnection.url);
  }

  private async connectToCassandra() {
    try {
      await initCassandra();
    } catch (error) {
      logger.error(`Cassandra connection failed: ${error.message}`);
    }
  }

  private initializeMiddlewares() {
    this.app.use(morgan(LOG_FORMAT, { stream }));
    this.app.use(cors({ origin: ORIGIN, credentials: CREDENTIALS }));
    this.app.use(hpp());
    this.app.use(helmet());
    this.app.use(compression());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cookieParser());
  }

  private initializeRoutes(routes: Routes[]) {
    routes.forEach(route => {
      this.app.use('/api', route.router);
    });
  }

  private initializeSwagger() {
    const options = {
      swaggerDefinition: {
        info: {
          title: 'REST API',
          version: '1.0.0',
          description: 'Example docs',
        },
      },
      apis: [join(__dirname, '../../swagger.yaml')],
    };

    const specs = swaggerJSDoc(options);
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
  }

  private initializeErrorHandling() {
    this.app.use(errorMiddleware);
  }
}

export default App;
