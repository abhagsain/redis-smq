import { getQueueManager, getRedisInstance, produceMessage } from '../common';
import { delay, promisifyAll } from 'bluebird';
import { MessageManager } from '../../src/system/message-manager/message-manager';
import { redisKeys } from '../../src/system/common/redis-keys';

test('Concurrent delete operation', async () => {
  const { producer, message } = await produceMessage();
  const redisClient1 = await getRedisInstance();
  const messageManager1 = promisifyAll(new MessageManager(redisClient1));
  const redisClient2 = promisifyAll(await getRedisInstance());
  const messageManager2 = promisifyAll(new MessageManager(redisClient2));
  const queueName = producer.getQueueName();
  const ns = redisKeys.getNamespace();

  const res1 = await messageManager1.getPendingMessagesAsync(
    ns,
    queueName,
    0,
    100,
  );

  expect(res1.total).toBe(1);
  expect(res1.items[0].message.getId()).toBe(message.getId());

  const queueManager = promisifyAll(await getQueueManager());
  const queueMetrics = await queueManager.getQueueMetricsAsync(ns, queueName);
  expect(queueMetrics.pending).toBe(1);

  await expect(async () => {
    await Promise.all([
      messageManager1.deletePendingMessageAsync(
        ns,
        queueName,
        0,
        message.getId(),
      ),
      messageManager2.deletePendingMessageAsync(
        ns,
        queueName,
        0,
        message.getId(),
      ),
    ]);
  }).rejects.toThrow('Could not acquire a  lock. Try again later.');
  await delay(5000);
  const res2 = await messageManager1.getPendingMessagesAsync(
    ns,
    queueName,
    0,
    100,
  );

  expect(res2.total).toBe(0);
  expect(res2.items.length).toBe(0);

  const queueMetrics1 = await queueManager.getQueueMetricsAsync(ns, queueName);
  expect(queueMetrics1.pending).toBe(0);
});
