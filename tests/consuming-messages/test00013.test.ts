import { getConsumer, getProducer, untilConsumerIdle } from '../common';
import { Message } from '../../src/message';
import { delay } from 'bluebird';
import { ICallback } from '../../types';
import { events } from '../../src/system/common/events';

type TQueueMetrics = {
  receivedMessages: Message[];
  acks: number;
};

test('Given many queues, a message is not lost and re-queued to its origin queue in case of a consumer crash or a failure', async () => {
  const queueAMetrics: TQueueMetrics = {
    receivedMessages: [],
    acks: 0,
  };
  const queueAConsumer1 = getConsumer({
    queueName: 'queue_a',
    consumeMock: jest.fn((msg: Message, cb: ICallback<void>) => {
      // do not acknowledge/unacknowledge the message
      queueAMetrics.receivedMessages.push(msg);
      queueAConsumer1.shutdown();
    }),
  });
  queueAConsumer1.run();

  queueAConsumer1.on(events.DOWN, () => {
    // once stopped, start another consumer
    queueAConsumer2.run();
  });

  const queueAConsumer2 = getConsumer({
    queueName: 'queue_a',
    consumeMock: jest.fn((msg: Message, cb: ICallback<void>) => {
      queueAMetrics.receivedMessages.push(msg);
      cb();
    }),
  });
  queueAConsumer2.on(events.MESSAGE_ACKNOWLEDGED, () => {
    queueAMetrics.acks += 1;
  });

  const queueBMetrics: TQueueMetrics = {
    receivedMessages: [],
    acks: 0,
  };
  const queueBConsumer1 = getConsumer({
    queueName: 'queue_b',
    consumeMock: jest.fn((msg: Message, cb: ICallback<void>) => {
      queueBMetrics.receivedMessages.push(msg);
      cb(null);
    }),
  });
  queueBConsumer1.on(events.MESSAGE_ACKNOWLEDGED, () => {
    queueBMetrics.acks += 1;
  });
  queueBConsumer1.run();

  /**
   * Produce a message to QUEUE A
   */
  const msg = new Message();
  msg.setBody({ hello: 'world' });

  const queueAProducer = getProducer('queue_a');
  await queueAProducer.produceMessageAsync(msg);

  /**
   * Produce a message to QUEUE B
   */
  const anotherMsg = new Message();
  anotherMsg.setBody({ id: 'b' });

  const queueBProducer = getProducer('queue_b');
  await queueBProducer.produceMessageAsync(anotherMsg);

  /**
   * Wait 10s
   */
  await delay(10000);

  /**
   *  Wait until consumers are idle
   */
  await untilConsumerIdle(queueAConsumer2);
  await untilConsumerIdle(queueBConsumer1);

  /**
   * Check
   */
  expect(queueAMetrics.acks).toBe(1);
  expect(queueBMetrics.acks).toBe(1);
  expect(queueAMetrics.receivedMessages.length).toBe(2);
  expect(queueAMetrics.receivedMessages[0].getId()).toBe(msg.getId());
  expect(queueAMetrics.receivedMessages[1].getId()).toBe(msg.getId());
  expect(queueBMetrics.receivedMessages.length).toBe(1);
  expect(queueBMetrics.receivedMessages[0].getId()).toBe(anotherMsg.getId());
});
