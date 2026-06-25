import 'reflect-metadata';
import http from 'http';
import { join } from 'path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import morgan from 'morgan';
import { disconnect } from 'mongoose';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import { NODE_ENV, PORT, LOG_FORMAT, ORIGIN, CREDENTIALS } from '@config';
import { dbConnect } from '@databases';
import { cassandraConnect, cassandraDisconnect } from '@databases/cassandra';
import { redisConnect, redisDisconnect } from '@databases/redis';
import { Routes } from '@interfaces/routes.interface';
import errorMiddleware from '@middlewares/error.middleware';
import { initChatGateway } from '@sockets/chat.gateway';
import { logger, stream } from '@utils/logger';

class App {
  public app: express.Application;
  public server: http.Server;
  public env: string;
  public port: string | number;

  constructor(routes: Routes[]) {
    this.app = express();
    this.env = NODE_ENV || 'development';
    this.port = PORT || 8000;

    // Single HTTP server shared by Express + Socket.io
    this.server = http.createServer(this.app);

    this.connectToDatabase();
    this.initializeMiddlewares();
    this.initializeRoutes(routes);
    this.initializeSwagger();
    this.initializeErrorHandling();
  }

  public listen(): void {
    this.server.listen(this.port, () => {
      logger.info('=================================');
      logger.info(`======= ENV: ${this.env} =======`);
      logger.info(`🚀 App listening on port ${this.port}`);
      logger.info(`⚡ Socket.io attached to same port`);
      logger.info('=================================');
    });
  }

  public async closeDatabaseConnection(): Promise<void> {
    try {
      await disconnect();
      await cassandraDisconnect();
      await redisDisconnect();
      logger.info('Disconnected from all databases');
    } catch (error) {
      logger.error('Error closing database connections:', error);
    }
  }

  public getServer(): express.Application {
    return this.app;
  }

  public getHttpServer(): http.Server {
    return this.server;
  }

  private async connectToDatabase(): Promise<void> {
    await dbConnect();
    await cassandraConnect();
    await redisConnect();

    // Initialise Socket.io gateway after all data stores are ready
    initChatGateway(this.server);
    logger.info('[App] ChatGateway initialised');
  }

  private initializeMiddlewares(): void {
    this.app.use(morgan(LOG_FORMAT ?? 'dev', { stream }));
    this.app.use(cors({ origin: ORIGIN, credentials: CREDENTIALS }));
    this.app.use(hpp());
    this.app.use(helmet());
    this.app.use(compression());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cookieParser());
  }

  private initializeRoutes(routes: Routes[]): void {
    routes.forEach(route => {
      this.app.use('/api/', route.router);
    });

    // Health endpoint
    this.app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', uptime: process.uptime() });
    });
  }

  private initializeSwagger(): void {
    const options = {
      swaggerDefinition: {
        info: {
          title: 'TalkApp API',
          version: '1.0.0',
          description: 'Language learning chat API',
        },
      },
      apis: [join(__dirname, '../../swagger.yaml')],
    };
    const specs = swaggerJSDoc(options);
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
  }

  private initializeErrorHandling(): void {
    this.app.use(errorMiddleware);
  }
}

export default App;
