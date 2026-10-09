import { prisma, withSerializableRetry, withSerializableTransaction } from '@repo/db';
import { BookingStatus } from '@repo/shared';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';


/**
 * Background worker.
 *
 * Two recurring responsibilities:
 *  1. Sweep seat holds whose deadline has passed and expire the bookings that own
 *     them, so inventory never gets stuck behind an abandoned checkout.
 *  2. Release ticket PDFs and notification jobs (enqueued by the API) — a stub
 *     until the ticketing phase lands.
 */

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'worker' },
});

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const QUEUE_NAMES = {
  HOLD_EXPIRY: 'hold-expiry',
  TICKETING: 'ticketing',
  NOTIFICATIONS: 'notifications',
} as const;

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 5_000 },
} as const;

export function createQueues(): Record<string, Queue> {
  return {
    [QUEUE_NAMES.HOLD_EXPIRY]: new Queue(QUEUE_NAMES.HOLD_EXPIRY, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }),
    [QUEUE_NAMES.TICKETING]: new Queue(QUEUE_NAMES.TICKETING, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }),
    [QUEUE_NAMES.NOTIFICATIONS]: new Queue(QUEUE_NAMES.NOTIFICATIONS, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }),
  };
}

export interface ExpiryResult {
  readonly releasedSeats: number;
  readonly expiredBookings: number;
}

/**
 * Releases lapsed seat holds and expires their bookings.
 *
 * Runs `releasedSeats` and `expiredBookings` in that order because a booking that
 * is HELD or PENDING_PAYMENT with no remaining held seats is definitionally
 * expired. Expiring first would leave orphaned holds.
 */
export async function sweepExpiredHolds(now = new Date()): Promise<ExpiryResult> {
  const staleSeats = await prisma.seat.findMany({
    where: { status: 'HELD', holdExpiresAt: { lt: now } },
    select: { id: true, flightId: true },
    take: 1_000,
  });

  if (staleSeats.length === 0) {
    return { releasedSeats: 0, expiredBookings: 0 };
  }

  const seatIds = staleSeats.map((seat) => seat.id);

  // Every booking that owns one of these seats and is still awaiting action.
  const affected = await prisma.bookingSeat.findMany({
    where: { seatId: { in: seatIds } },
    select: { bookingPnr: true },
    distinct: ['bookingPnr'],
  });

  const candidatePnrs = affected.map((row) => row.bookingPnr);

  const releasable = await prisma.booking.findMany({
    where: {
      pnr: { in: candidatePnrs },
      status: { in: [BookingStatus.HELD, BookingStatus.PENDING_PAYMENT] },
      OR: [{ expiresAt: { lt: now } }, { expiresAt: null }],
    },
    select: { pnr: true, status: true },
  });

  let releasedSeats = 0;
  let expiredBookings = 0;

  for (const booking of releasable) {
    await withSerializableRetry(() =>
      withSerializableTransaction(prisma, async (tx) => {
        const assigned = await tx.bookingSeat.findMany({
          where: { bookingPnr: booking.pnr },
          select: { seatId: true },
        });
        const owned = assigned.map((row) => row.seatId);

        if (owned.length > 0) {
          const freed = await tx.seat.updateMany({
            where: { id: { in: owned }, status: 'HELD' },
            data: { status: 'AVAILABLE', holdExpiresAt: null },
          });
          releasedSeats += freed.count;
        }

        await tx.booking.update({
          where: { pnr: booking.pnr },
          data: { status: BookingStatus.EXPIRED, expiresAt: null },
        });

        await tx.bookingEvent.create({
          data: {
            bookingPnr: booking.pnr,
            fromStatus: booking.status,
            toStatus: BookingStatus.EXPIRED,
            actorType: 'system',
            message: 'Hold expired before payment',
          },
        });
      }),
    );

    expiredBookings += 1;
    logger.info({ pnr: booking.pnr }, 'expired booking and released its seats');
  }

  // Seats held by a booking that was already terminal (cancelled, failed) are
  // released here rather than by the loop above, which only handles live holds.
  const orphaned = await prisma.seat.findMany({
    where: { id: { in: seatIds }, status: 'HELD', holdExpiresAt: { lt: now } },
    select: { id: true },
    take: 1_000,
  });

  if (orphaned.length > 0) {
    const result = await prisma.seat.updateMany({
      where: { id: { in: orphaned.map((seat) => seat.id) }, status: 'HELD' },
      data: { status: 'AVAILABLE', holdExpiresAt: null },
    });
    releasedSeats += result.count;
    logger.info({ count: result.count }, 'released orphaned seat holds');
  }

  return { releasedSeats, expiredBookings };
}

export interface TicketingJobData {
  readonly pnr: string;
  readonly paymentId: string;
}

/**
 * Issues tickets for a confirmed booking.
 *
 * Placeholder for the ticketing phase: it demonstrates the retry-safe shape the
 * real implementation will keep — idempotent by `pnr`, safe to run twice.
 */
async function processTicketing(job: Job<TicketingJobData>): Promise<void> {
  const { pnr, paymentId } = job.data;

  const booking = await prisma.booking.findUnique({
    where: { pnr },
    select: { pnr: true, status: true },
  });

  if (!booking) {
    logger.warn({ pnr, paymentId }, 'ticketing job for an unknown booking');
    return;
  }

  if (booking.status !== BookingStatus.CONFIRMED) {
    logger.info({ pnr, status: booking.status }, 'ticketing skipped: booking is not confirmed');
    return;
  }

  logger.info({ pnr, paymentId }, 'ticketing job accepted (issuance implemented in phase 4)');
}

export function startWorkers(): { close: () => Promise<void> } {
  const queues = createQueues();
  const workers: Worker[] = [];

  const expiryWorker = new Worker(
    QUEUE_NAMES.HOLD_EXPIRY,
    async (job) => {
      if (job.name === 'sweep') {
        const result = await sweepExpiredHolds();
        return result;
      }
      throw new Error(`Unknown job: ${job.name}`);
    },
    { connection, concurrency: 1 },
  );

  const ticketingWorker = new Worker(
    QUEUE_NAMES.TICKETING,
    async (job) => {
      await processTicketing(job as Job<TicketingJobData>);
    },
    { connection, concurrency: 3 },
  );

  for (const worker of [expiryWorker, ticketingWorker]) {
    worker.on('failed', (job, error) => {
      logger.error({ jobId: job?.id, queue: job?.queueName, err: error }, 'job failed');
    });
  }

  workers.push(expiryWorker, ticketingWorker);

  // A repeating sweep is more robust than scheduling the next run after each
  // completion, because it survives a worker restart mid-cycle.
  const expiryQueue = queues[QUEUE_NAMES.HOLD_EXPIRY];
  if (expiryQueue) {
    void expiryQueue.add(
      'sweep',
      {},
      { repeat: { every: 60_000 }, jobId: 'hold-expiry-sweep' },
    );
  }

  logger.info('workers started');

  return {
    close: async () => {
      await Promise.all(workers.map(async (worker) => worker.close()));
      await Promise.all(Object.values(queues).map(async (queue) => queue.close()));
      await connection.quit();
      await prisma.$disconnect();
    },
  };
}
