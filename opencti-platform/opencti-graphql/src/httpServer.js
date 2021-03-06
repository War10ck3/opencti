// noinspection NodeCoreCodingAssistance
import http from 'http';
import conf, { logger } from './config/conf';
import createApp from './app';
import createApolloServer from './graphql/graphql';
import { initBroadcaster } from './graphql/sseMiddleware';
import initExpiredManager from './manager/expiredManager';

const PORT = conf.get('app:port');
const REQ_TIMEOUT = conf.get('app:request_timeout');
const broadcaster = initBroadcaster();
const expiredManager = initExpiredManager();
const createHttpServer = async () => {
  const apolloServer = createApolloServer();
  const { app, seeMiddleware } = await createApp(apolloServer, broadcaster);
  const httpServer = http.createServer(app);
  httpServer.setTimeout(REQ_TIMEOUT || 120000);
  apolloServer.installSubscriptionHandlers(httpServer);
  await broadcaster.start();
  await expiredManager.start();
  return { httpServer, seeMiddleware };
};

export const listenServer = async () => {
  return new Promise((resolve, reject) => {
    try {
      const serverPromise = createHttpServer();
      serverPromise.then(({ httpServer, seeMiddleware }) => {
        httpServer.on('close', () => {
          if (seeMiddleware) seeMiddleware.shutdown();
          expiredManager.shutdown();
        });
        httpServer.listen(PORT, () => {
          logger.info(`[OPENCTI] Servers ready on port ${PORT}`);
          resolve(httpServer);
        });
      });
    } catch (e) {
      logger.error(`[OPENCTI] Start http server fail`, { error: e });
      reject(e);
    }
  });
};
export const restartServer = async (httpServer) => {
  return new Promise((resolve, reject) => {
    httpServer.close(() => {
      logger.info('[OPENCTI] GraphQL server stopped');
      listenServer()
        .then((server) => resolve(server))
        .catch((e) => reject(e));
    });
    httpServer.emit('close'); // force server close
  });
};
export const stopServer = async (httpServer) => {
  await broadcaster.shutdown();
  await expiredManager.shutdown();
  return new Promise((resolve) => {
    httpServer.close(() => {
      resolve();
    });
    httpServer.emit('close'); // force server close
  });
};

export default createHttpServer;
