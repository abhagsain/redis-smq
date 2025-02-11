import { promisifyAll } from 'bluebird';
import {
  TGetMessagesReply,
  TGetPendingMessagesWithPriorityReply,
  TGetScheduledMessagesReply,
} from '../../../types';
import { GetScheduledMessagesRequestDTO } from '../controllers/scheduled-messages/get-scheduled-messages/get-scheduled-messages-request.DTO';
import { DeleteScheduledMessageRequestDTO } from '../controllers/scheduled-messages/delete-scheduled-message/delete-scheduled-message-request.DTO';
import { MessageManager } from '../../system/message-manager/message-manager';
import { GetPendingMessagesRequestDTO } from '../controllers/messages/actions/get-pending-messages/get-pending-messages-request.DTO';
import { GetAcknowledgedMessagesRequestDTO } from '../controllers/messages/actions/get-acknowledged-messages/get-acknowledged-messages-request.DTO';
import { GetPendingMessagesWithPriorityRequestDTO } from '../controllers/messages/actions/get-pending-messages-with-priority/get-pending-messages-with-priority-request.DTO';
import { GetDeadLetteredMessagesRequestDTO } from '../controllers/messages/actions/get-dead-lettered-messages/get-dead-lettered-messages-request.DTO';
import { DeletePendingMessageRequestDTO } from '../controllers/messages/actions/delete-pending-message/delete-pending-message-request.DTO';
import { DeleteAcknowledgedMessageRequestDTO } from '../controllers/messages/actions/delete-acknowledged-message/delete-acknowledged-message-request.DTO';
import { DeleteDeadLetteredMessageRequestDTO } from '../controllers/messages/actions/delete-dead-lettered-message/delete-dead-lettered-message-request.DTO';
import { DeletePendingMessageWithPriorityRequestDTO } from '../controllers/messages/actions/delete-pending-message-with-priority/delete-pending-message-with-priority-request.DTO';
import { RequeueDeadLetteredMessageRequestDTO } from '../controllers/messages/actions/requeue-dead-lettered-message/requeue-dead-lettered-message-request.DTO';
import { RequeueAcknowledgedMessageRequestDTO } from '../controllers/messages/actions/requeue-acknowledged-message/requeue-acknowledged-message-request.DTO';

const messageManagerAsync = promisifyAll(MessageManager.prototype);

export class MessageManagerService {
  protected messageManager: typeof messageManagerAsync;

  constructor(messageManager: MessageManager) {
    this.messageManager = promisifyAll(messageManager);
  }

  async getScheduledMessages(
    args: GetScheduledMessagesRequestDTO,
  ): Promise<TGetScheduledMessagesReply> {
    const { skip = 0, take = 1 } = args;
    return this.messageManager.getScheduledMessagesAsync(skip, take);
  }

  async getPendingMessages(
    args: GetPendingMessagesRequestDTO,
  ): Promise<TGetMessagesReply> {
    const { ns, queueName, skip = 0, take = 1 } = args;
    return this.messageManager.getPendingMessagesAsync(
      queueName,
      ns,
      skip,
      take,
    );
  }

  async getAcknowledgedMessages(
    args: GetAcknowledgedMessagesRequestDTO,
  ): Promise<TGetMessagesReply> {
    const { ns, queueName, skip = 0, take = 1 } = args;
    return this.messageManager.getAcknowledgedMessagesAsync(
      queueName,
      ns,
      skip,
      take,
    );
  }

  async getPendingMessagesWithPriority(
    args: GetPendingMessagesWithPriorityRequestDTO,
  ): Promise<TGetPendingMessagesWithPriorityReply> {
    const { ns, queueName, skip = 0, take = 1 } = args;
    return this.messageManager.getPendingMessagesWithPriorityAsync(
      queueName,
      ns,
      skip,
      take,
    );
  }

  async getDeadLetteredMessages(
    args: GetDeadLetteredMessagesRequestDTO,
  ): Promise<TGetMessagesReply> {
    const { ns, queueName, skip = 0, take = 1 } = args;
    return this.messageManager.getDeadLetteredMessagesAsync(
      queueName,
      ns,
      skip,
      take,
    );
  }

  async deletePendingMessage(
    args: DeletePendingMessageRequestDTO,
  ): Promise<void> {
    const { ns, queueName, id, sequenceId } = args;
    return this.messageManager.deletePendingMessageAsync(
      queueName,
      ns,
      sequenceId,
      id,
    );
  }

  async deletePendingMessageWithPriority(
    args: DeletePendingMessageWithPriorityRequestDTO,
  ): Promise<void> {
    const { ns, queueName, id } = args;
    return this.messageManager.deletePendingMessageWithPriorityAsync(
      queueName,
      ns,
      id,
    );
  }

  async deleteAcknowledgedMessage(
    args: DeleteAcknowledgedMessageRequestDTO,
  ): Promise<void> {
    const { ns, queueName, id, sequenceId } = args;
    return this.messageManager.deleteAcknowledgedMessageAsync(
      queueName,
      ns,
      sequenceId,
      id,
    );
  }

  async deleteDeadLetteredMessage(
    args: DeleteDeadLetteredMessageRequestDTO,
  ): Promise<void> {
    const { ns, queueName, id, sequenceId } = args;
    return this.messageManager.deleteDeadLetterMessageAsync(
      queueName,
      ns,
      sequenceId,
      id,
    );
  }

  async deleteScheduledMessage(
    args: DeleteScheduledMessageRequestDTO,
  ): Promise<void> {
    const { id } = args;
    return this.messageManager.deleteScheduledMessageAsync(id);
  }

  async requeueDeadLetteredMessage(
    args: RequeueDeadLetteredMessageRequestDTO,
  ): Promise<void> {
    const { ns, queueName, id, sequenceId, priority } = args;
    return this.messageManager.requeueMessageFromDLQueueAsync(
      queueName,
      ns,
      sequenceId,
      id,
      typeof priority !== 'undefined',
      priority,
    );
  }

  async requeueAcknowledgedMessage(
    args: RequeueAcknowledgedMessageRequestDTO,
  ): Promise<void> {
    const { ns, queueName, id, sequenceId, priority } = args;
    return this.messageManager.requeueMessageFromAcknowledgedQueueAsync(
      queueName,
      ns,
      sequenceId,
      id,
      typeof priority !== 'undefined',
      priority,
    );
  }
}
