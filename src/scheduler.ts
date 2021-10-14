import * as async from 'async';
import {
  ICallback,
  IConfig,
  TGetScheduledMessagesReply,
  TRedisClientMulti,
} from '../types';
import { Message } from './message';
import { parseExpression } from 'cron-parser';
import { RedisClient } from './redis-client';
import { redisKeys } from './redis-keys';
import { EventEmitter } from 'events';
import { events } from './events';
import { Broker } from './broker';
import { Metadata } from './metadata';

export class Scheduler extends EventEmitter {
  protected static instance: Scheduler | null = null;
  protected queueName: string;
  protected redisClient: RedisClient;
  protected keys: ReturnType<typeof redisKeys['getKeys']>;
  protected metadata: Metadata;

  constructor(queueName: string, redisClient: RedisClient) {
    super();
    this.queueName = queueName;
    this.keys = redisKeys.getKeys(queueName);
    this.redisClient = redisClient;
    this.metadata = new Metadata(this);
  }

  protected scheduleAtTimestamp(
    message: Message,
    timestamp: number,
    mixed: TRedisClientMulti | ICallback<boolean>,
  ): void {
    const { keyQueueScheduledMessages, keyIndexScheduledMessages } = this.keys;
    const schedule = (m: TRedisClientMulti) => {
      const msgStr = message.toString();
      m.zadd(keyQueueScheduledMessages, timestamp, msgStr);
      m.hset(keyIndexScheduledMessages, message.getId(), msgStr);
      this.emit(events.PRE_MESSAGE_SCHEDULED, message, this.queueName, m);
      return m;
    };
    if (typeof mixed === 'object') schedule(mixed);
    else if (typeof mixed === 'function') {
      const m = this.redisClient.multi();
      schedule(m).exec((err) => {
        if (err) mixed(err);
        else mixed(null, true);
      });
    } else {
      throw new Error(
        'Invalid function argument [mixed]. Expected a callback or an instance of Multi.',
      );
    }
  }

  protected scheduleAtNextTimestamp(
    msg: Message,
    multi: TRedisClientMulti,
  ): void {
    if (this.isPeriodic(msg)) {
      const timestamp = this.getNextScheduledTimestamp(msg) ?? 0;
      if (timestamp > 0) {
        this.scheduleAtTimestamp(msg, timestamp, multi);
      }
    }
  }

  protected enqueueScheduledMessage(
    broker: Broker,
    msg: Message,
    multi: TRedisClientMulti,
  ): void {
    const { keyQueueScheduledMessages } = this.keys;
    multi.zrem(keyQueueScheduledMessages, msg.toString());
    const message = this.isPeriodic(msg)
      ? Message.createFromMessage(msg, true)
      : msg;
    this.emit(
      events.PRE_MESSAGE_SCHEDULED_ENQUEUE,
      message,
      this.queueName,
      multi,
    );
    broker.enqueueMessage(message, multi);
  }

  //@todo Modify message from outside this function
  //@todo and make getNextScheduledTimestamp() return just values
  protected getNextScheduledTimestamp(message: Message): number | null {
    if (this.isSchedulable(message)) {
      // Delay
      const msgScheduledDelay = message.getMessageScheduledDelay();
      if (msgScheduledDelay && !message.isDelayed()) {
        message.setMessageDelayed(true);
        return Date.now() + msgScheduledDelay;
      }

      // CRON
      const msgScheduledCron = message.getMessageScheduledCRON();
      const cronTimestamp = msgScheduledCron
        ? parseExpression(msgScheduledCron).next().getTime()
        : 0;

      // Repeat
      const msgScheduledRepeat = message.getMessageScheduledRepeat();
      let repeatTimestamp = 0;
      if (msgScheduledRepeat) {
        const newCount = message.getMessageScheduledRepeatCount() + 1;
        if (newCount <= msgScheduledRepeat) {
          const msgScheduledPeriod = message.getMessageScheduledPeriod();
          const now = Date.now();
          if (msgScheduledPeriod) {
            repeatTimestamp = now + msgScheduledPeriod;
          } else {
            repeatTimestamp = now;
          }
        }
      }

      if (repeatTimestamp && cronTimestamp) {
        if (
          repeatTimestamp < cronTimestamp &&
          message.hasScheduledCronFired()
        ) {
          message.incrMessageScheduledRepeatCount();
          return repeatTimestamp;
        }
      }

      if (cronTimestamp) {
        // reset repeat count on each cron tick
        message.resetMessageScheduledRepeatCount();

        // if the message has also a repeat scheduling then the first time it will fires only
        // after CRON scheduling has been fired
        message.setMessageScheduledCronFired(true);

        return cronTimestamp;
      }

      if (repeatTimestamp) {
        message.incrMessageScheduledRepeatCount();
        return repeatTimestamp;
      }
    }
    return 0;
  }

  isSchedulable(message: Message): boolean {
    return (
      message.getMessageScheduledCRON() !== null ||
      message.getMessageScheduledDelay() !== null ||
      message.getMessageScheduledRepeat() > 0
    );
  }

  isPeriodic(message: Message): boolean {
    return (
      message.getMessageScheduledCRON() !== null ||
      message.getMessageScheduledRepeat() > 0
    );
  }

  schedule(
    message: Message,
    mixed: TRedisClientMulti | ICallback<boolean>,
  ): void {
    const timestamp = this.getNextScheduledTimestamp(message) ?? 0;
    if (timestamp > 0) {
      this.scheduleAtTimestamp(message, timestamp, mixed);
    } else if (typeof mixed === 'function') mixed(null, false);
  }

  deleteScheduledMessage(messageId: string, cb: ICallback<boolean>): void {
    const { keyQueueScheduledMessages, keyIndexScheduledMessages } = this.keys;
    const getMessage = (cb: ICallback<string>) => {
      this.redisClient.hget(keyIndexScheduledMessages, messageId, cb);
    };
    const deleteMessage = (msg: string | null, cb: ICallback<boolean>) => {
      if (msg) {
        const multi = this.redisClient.multi();
        multi.zrem(keyQueueScheduledMessages, msg);
        multi.hdel(keyIndexScheduledMessages, messageId);
        this.emit(
          events.PRE_MESSAGE_SCHEDULED_DELETE,
          Message.createFromMessage(msg),
          this.queueName,
          multi,
        );
        this.redisClient.execMulti(
          multi,
          (err?: Error | null, reply?: number[] | null) => {
            if (err) cb(err);
            else cb(null, reply && reply[0] === 1 && reply[1] === 1);
          },
        );
      } else cb(null, false);
    };
    async.waterfall([getMessage, deleteMessage], cb);
  }

  enqueueScheduledMessages(broker: Broker, cb: ICallback<void>): void {
    const now = Date.now();
    const { keyQueueScheduledMessages } = this.keys;
    const process = (messages: string[], cb: ICallback<void>) => {
      if (messages.length) {
        async.each<string, Error>(
          messages,
          (msg, done) => {
            const message = Message.createFromMessage(msg);
            const multi = this.redisClient.multi();
            this.enqueueScheduledMessage(broker, message, multi);
            this.scheduleAtNextTimestamp(message, multi);
            multi.exec(done);
          },
          cb,
        );
      } else cb();
    };
    const fetch = (cb: ICallback<string[]>) => {
      this.redisClient.zrangebyscore(keyQueueScheduledMessages, 0, now, cb);
    };
    async.waterfall([fetch, process], cb);
  }

  getScheduledMessages(
    skip: number,
    take: number,
    cb: ICallback<TGetScheduledMessagesReply>,
  ): void {
    Scheduler.getScheduledMessages(
      this.redisClient,
      this.queueName,
      skip,
      take,
      cb,
    );
  }

  quit(cb: ICallback<void>): void {
    if (this === Scheduler.instance) {
      this.redisClient.halt(() => {
        Scheduler.instance = null;
        cb();
      });
    } else cb();
  }

  static getSingletonInstance(
    queueName: string,
    config: IConfig,
    cb: ICallback<Scheduler>,
  ): void {
    if (!Scheduler.instance) {
      RedisClient.getNewInstance(config, (redisClient) => {
        const instance = new Scheduler(queueName, redisClient);
        Scheduler.instance = instance;
        cb(null, instance);
      });
    } else cb(null, Scheduler.instance);
  }

  static getScheduledMessages(
    client: RedisClient,
    queueName: string,
    skip: number,
    take: number,
    cb: ICallback<TGetScheduledMessagesReply>,
  ): void {
    const getTotalFn = (redisClient: RedisClient, cb: ICallback<number>) =>
      Metadata.getQueueMetadataByKey(redisClient, queueName, 'scheduled', cb);
    const transformFn = (msgStr: string) => Message.createFromMessage(msgStr);
    const { keyQueueScheduledMessages } = redisKeys.getKeys(queueName);
    client.zRangePage(
      keyQueueScheduledMessages,
      skip,
      take,
      getTotalFn,
      transformFn,
      cb,
    );
  }
}
