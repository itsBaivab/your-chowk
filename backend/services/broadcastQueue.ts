// ============================================
// Broadcast Queue — Throttled message sending
// ============================================
// Prevents WhatsApp spam detection by spacing out messages
// Uses an in-memory queue with configurable delay

import logger from '../utils/logger';

type SendMessageFn = (jid: string, text: string) => Promise<void>;

interface QueueItem {
    jid: string;
    text: string;
    addedAt: number;
}

const MESSAGE_DELAY_MS = 2000; // 2 seconds between messages

let queue: QueueItem[] = [];
let isProcessing = false;
let sendFn: SendMessageFn | null = null;

/**
 * Initialize the broadcast queue with a send function.
 */
function init(sendMessage: SendMessageFn): void {
    sendFn = sendMessage;
}

/**
 * Add a message to the broadcast queue.
 */
function enqueue(jid: string, text: string): void {
    queue.push({ jid, text, addedAt: Date.now() });
    logger.debug({ event: 'broadcast_enqueued', jid, queueLength: queue.length });

    // Start processing if not already running
    if (!isProcessing) {
        processQueue();
    }
}

/**
 * Process the queue sequentially with throttling.
 * Sends one message at a time with a delay between each.
 */
async function processQueue(): Promise<void> {
    if (isProcessing) return;
    isProcessing = true;

    while (queue.length > 0) {
        const item = queue.shift()!;

        try {
            if (sendFn) {
                await sendFn(item.jid, item.text);
                logger.debug({ event: 'broadcast_sent_single', jid: item.jid });
            } else {
                logger.warn({ event: 'broadcast_no_send_fn', message: 'Send function not initialized' });
            }
        } catch (error) {
            logger.serviceError('broadcastQueue.processQueue', error as Error);
        }

        // Wait before sending next message
        if (queue.length > 0) {
            await sleep(MESSAGE_DELAY_MS);
        }
    }

    isProcessing = false;
}

/**
 * Broadcast a message to multiple recipients.
 */
function broadcast(jids: string[], text: string): void {
    for (const jid of jids) {
        enqueue(jid, text);
    }
    logger.broadcastSent(jids.length, 'broadcast');
}

/**
 * Get current queue status.
 */
function getStatus(): { queueLength: number; isProcessing: boolean } {
    return { queueLength: queue.length, isProcessing };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export {
    init,
    enqueue,
    broadcast,
    getStatus,
};
