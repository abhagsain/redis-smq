export const events = {
  GOING_UP: 'going_up',
  UP: 'up',
  GOING_DOWN: 'going_down',
  DOWN: 'down',
  ERROR: 'error',
  IDLE: 'idle',
  SHUTDOWN_READY: 'shutdown_ready',
  GC_LOCK_ACQUIRED: 'gc_lock_acquired',

  MESSAGE_PRODUCED: 'message_produced',
  MESSAGE_NEXT: 'message_next',
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_ACKNOWLEDGED: 'message_acknowledged',
  MESSAGE_UNACKNOWLEDGED: 'message_unacknowledged',
  MESSAGE_CONSUME_TIMEOUT: 'message_consume_timeout',
  MESSAGE_EXPIRED: 'message_expired',
  MESSAGE_RETRY: 'message_retry',
  MESSAGE_RETRY_AFTER_DELAY: 'message_retry_after_delay',
  MESSAGE_DEAD_LETTER: 'message_dead_letter',
  MESSAGE_ENQUEUED: 'message_enqueued',
  MESSAGE_SCHEDULED: 'message_scheduled',

  PRE_MESSAGE_ACKNOWLEDGED: 'pre_message_acknowledged',
  PRE_MESSAGE_UNACKNOWLEDGED: 'pre_message_unacknowledged',
  PRE_MESSAGE_DEAD_LETTER: 'pre_message_dead_letter',
  PRE_MESSAGE_ENQUEUED: 'pre_message_enqueued',
  PRE_MESSAGE_WITH_PRIORITY_ENQUEUED: 'pre_priority_message_enqueued',
  PRE_MESSAGE_RECEIVED: 'pre_message_received',
  PRE_MESSAGE_SCHEDULED: 'pre_message_scheduled',
  PRE_MESSAGE_SCHEDULED_ENQUEUE: 'pre_message_scheduled_dequeue',
  PRE_MESSAGE_SCHEDULED_DELETE: 'pre_message_scheduled_delete',
};
