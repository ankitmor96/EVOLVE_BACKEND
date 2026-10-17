
import { Queue } from 'bullmq';

async function testPostsQueue() {
  const queue = new Queue('posts', {
    connection: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
    },
  });

  try {
    const job = await queue.add(
      'post-created',
      {
        postId: 2,
        userId: 39,
      },
    );

    console.log('✅ Test job added successfully');
    console.log('Job ID:', job.id);
    console.log('Job name:', job.name);
  } catch (error) {
    console.error('❌ Failed to add test job:', error);
  } finally {
    await queue.close();
  }
}

testPostsQueue();
