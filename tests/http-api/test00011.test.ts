import {
  ISuperTestResponse,
  produceMessage,
  startMonitorServer,
} from '../common';
import * as supertest from 'supertest';
import { GetMessagesResponseBodyDataDTO } from '../../src/monitor-server/controllers/common/get-messages-response-body.DTO';
import { redisKeys } from '../../src/system/common/redis-keys/redis-keys';

test('Delete a pending message', async () => {
  await startMonitorServer();
  const { message } = await produceMessage();
  const request = supertest('http://127.0.0.1:3000');
  const response1: ISuperTestResponse<GetMessagesResponseBodyDataDTO> =
    await request.delete(
      `/api/ns/${redisKeys.getNamespace()}/queues/${
        message.getQueue()?.name
      }/pending-messages/${message.getId()}?sequenceId=0`,
    );
  expect(response1.statusCode).toBe(204);
  expect(response1.body).toEqual({});
});
