const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  

// Producer: adds a job
const reminderQueue = new Queue('reminderQueue', { connection });

// Add test job
reminderQueue.add('sendReminder', { email: 'test@example.com' }, { delay: 10000 }); // 10 sec

// Worker: processes jobs
const worker = new Worker('reminderQueue', async job => {
  console.log(`📬 Sending reminder to: ${job.data.email}`);
}, { connection });

worker.on('completed', job => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err);
});
