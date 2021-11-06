import { Message } from '../../message';
import { redisKeys } from '../../common/redis-keys';
import * as async from 'async';
import { RedisClient } from '../../redis-client/redis-client';
import { ICallback, TGetMessagesReply } from '../../../../types';
import { parseExpression } from 'cron-parser';
import {
  deleteSortedSetMessageAtSequenceId,
  getPaginatedSortedSetMessages,
} from '../common';
import { Handler } from './handler';

export class ScheduleHandler extends Handler {
  getScheduledMessages(
    skip: number,
    take: number,
    cb: ICallback<TGetMessagesReply>,
  ): void {
    const { keyQueueScheduled } = redisKeys.getGlobalKeys();
    getPaginatedSortedSetMessages(
      this.redisClient,
      keyQueueScheduled,
      skip,
      take,
      cb,
    );
  }

  deleteScheduled(index: number, messageId: string, cb: ICallback<void>): void {
    const { keyQueueScheduled, keyLockDeleteScheduledMessage } =
      redisKeys.getGlobalKeys();
    deleteSortedSetMessageAtSequenceId(
      this.redisClient,
      keyLockDeleteScheduledMessage,
      keyQueueScheduled,
      index,
      messageId,
      cb,
    );
  }

  schedule(message: Message, cb: ICallback<boolean>): void {
    const timestamp = ScheduleHandler.getNextScheduledTimestamp(message) ?? 0;
    if (timestamp > 0) {
      const { keyQueueScheduled } = redisKeys.getGlobalKeys();
      this.redisClient.zadd(
        keyQueueScheduled,
        timestamp,
        JSON.stringify(message),
        (err) => {
          if (err) cb(err);
          else cb(null, true);
        },
      );
    } else cb(null, false);
  }

  enqueueScheduledMessages(
    redisClient: RedisClient,
    withPriority: boolean,
    cb: ICallback<void>,
  ): void {
    const { keyQueueScheduled } = redisKeys.getGlobalKeys();
    const enqueue = (messages: string[], cb: ICallback<void>) => {
      if (messages.length) {
        async.each<string, Error>(
          messages,
          (msg, done) => {
            const message = Message.createFromMessage(msg);
            const queue = message.getQueue();
            if (!queue) throw new Error(`Got a message without a queue`);
            const { name, ns } = queue;
            const { keyQueuePriority, keyQueue } = redisKeys.getKeys(name, ns);
            const multi = redisClient.multi();
            multi.zrem(keyQueueScheduled, JSON.stringify(message));
            const priority = withPriority
              ? message.getSetPriority(undefined)
              : null;
            if (typeof priority === 'number') {
              multi.zadd(keyQueuePriority, priority, JSON.stringify(message));
            } else {
              multi.lpush(keyQueue, JSON.stringify(message));
            }
            const nextScheduleTimestamp =
              ScheduleHandler.getNextScheduledTimestamp(message);
            if (nextScheduleTimestamp) {
              multi.zadd(
                keyQueueScheduled,
                nextScheduleTimestamp,
                JSON.stringify(message),
              );
            }
            redisClient.execMulti(multi, (err) => done(err));
          },
          cb,
        );
      } else cb();
    };
    const fetch = (cb: ICallback<Message[]>) => {
      redisClient.zrangebyscore(
        keyQueueScheduled,
        0,
        Date.now(),
        (err, reply) => {
          if (err) cb(err);
          else {
            const messages = (reply ?? []).map((i) =>
              Message.createFromMessage(i),
            );
            cb(null, messages);
          }
        },
      );
    };
    async.waterfall([fetch, enqueue], (err) => cb(err));
  }

  static getNextScheduledTimestamp(message: Message): number {
    if (message.isSchedulable()) {
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
}
