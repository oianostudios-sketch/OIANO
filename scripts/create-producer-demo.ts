import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('producer123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'producer@dreamzmusiclab.com' },
    update: { password_hash: hash },
    create: {
      email: 'producer@dreamzmusiclab.com',
      name: 'Demo Producer',
      password_hash: hash,
      role: 'PRODUCER',
    },
  });

  const existing = await (prisma as any).producer.findUnique({ where: { user_id: user.id } });
  if (!existing) {
    await (prisma as any).producer.create({
      data: {
        user_id: user.id,
        display_name: 'Demo Producer',
        genres: ['Hip-Hop', 'R&B'],
        daw: 'Ableton Live',
      },
    });
    console.log('✅ Producer profile created');
  } else {
    console.log('ℹ️  Producer profile already exists');
  }

  console.log('✅ Demo producer user ready:', user.email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
