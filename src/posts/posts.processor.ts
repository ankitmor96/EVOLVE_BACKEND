
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

interface PostCreatedJob {
  postId: number;
  userId: number;
}

@Processor('posts')
export class PostsProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<PostCreatedJob>): Promise<void> {
    switch (job.name) {
      case 'post-created': {
        const { postId, userId } = job.data;

        console.log('📬 Post background job received');
        console.log('Post ID:', postId);
        console.log('User ID:', userId);

        // Verify that the post exists.
        const post = await this.prisma.client.orm.public.Post
          .where({ id: postId, userId })
          .first();

        if (!post) {
          throw new Error(
            `Post ${postId} not found for user ${userId}`,
          );
        }

        // Save notification in the database.
        await this.prisma.client.orm.public.Notification.create({
          userId,
          type: 'POST_CREATED',
          title: 'Post created successfully',
          message: `Your post #${postId} has been created successfully.`,
        });

        console.log('✅ Notification saved successfully');
        break;
      }

      default:
        console.warn(`Unknown posts job: ${job.name}`);
    }
  }
}