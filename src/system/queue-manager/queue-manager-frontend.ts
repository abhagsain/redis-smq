import {
  ICallback,
  IConfig,
  IQueueMetrics,
  TMessageQueue,
} from '../../../types';
import { RedisClient } from '../redis-client/redis-client';
import { QueueManager } from './queue-manager';
import BLogger from 'bunyan';
import { Logger } from '../common/logger';
import { EmptyCallbackReplyError } from '../common/errors/empty-callback-reply.error';

export class QueueManagerFrontend {
  private static instance: QueueManagerFrontend | null = null;
  private redisClient: RedisClient;
  private queueManager: QueueManager;

  private constructor(redisClient: RedisClient, logger: BLogger) {
    this.redisClient = redisClient;
    this.queueManager = new QueueManager(redisClient, logger);
  }

  ///

  purgeDeadLetterQueue(
    queueName: string,
    ns: string | undefined,
    cb: ICallback<void>,
  ): void {
    this.queueManager.purgeDeadLetterQueue(queueName, ns, cb);
  }

  purgeAcknowledgedMessagesQueue(
    queueName: string,
    ns: string | undefined,
    cb: ICallback<void>,
  ): void {
    this.queueManager.purgeAcknowledgedMessagesQueue(queueName, ns, cb);
  }

  purgeQueue(
    queueName: string,
    ns: string | undefined,
    cb: ICallback<void>,
  ): void {
    this.queueManager.purgeQueue(queueName, ns, cb);
  }

  purgePriorityQueue(
    queueName: string,
    ns: string | undefined,
    cb: ICallback<void>,
  ): void {
    this.queueManager.purgePriorityQueue(queueName, ns, cb);
  }

  purgeScheduledMessagesQueue(cb: ICallback<void>): void {
    this.queueManager.purgeScheduledMessagesQueue(cb);
  }

  ///

  getQueueMetrics(
    queueName: string,
    ns: string | undefined,
    cb: ICallback<IQueueMetrics>,
  ): void {
    this.queueManager.getQueueMetrics(queueName, ns, cb);
  }

  getMessageQueues(cb: ICallback<TMessageQueue[]>): void {
    this.queueManager.getMessageQueues(cb);
  }

  ///

  quit(cb: ICallback<void>): void {
    this.queueManager.quit(() => {
      this.redisClient.halt(() => {
        QueueManagerFrontend.instance = null;
        cb();
      });
    });
  }

  ///

  static getSingletonInstance(
    config: IConfig,
    cb: ICallback<QueueManagerFrontend>,
  ): void {
    if (!QueueManagerFrontend.instance) {
      RedisClient.getNewInstance(config, (err, client) => {
        if (err) cb(err);
        else if (!client) cb(new EmptyCallbackReplyError());
        else {
          const logger = Logger(QueueManagerFrontend.name, config.log);
          const instance = new QueueManagerFrontend(client, logger);
          QueueManagerFrontend.instance = instance;
          cb(null, instance);
        }
      });
    } else cb(null, QueueManagerFrontend.instance);
  }
}
