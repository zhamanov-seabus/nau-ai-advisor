import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, '../../.env') });

import { User, UserRole } from '../common/entities/user.entity';
import { OtpCode } from '../common/entities/otp-code.entity';
import { RefreshToken } from '../common/entities/refresh-token.entity';

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, OtpCode, RefreshToken],
  synchronize: true,
});

async function seed() {
  await dataSource.initialize();
  const usersRepo = dataSource.getRepository(User);

  const seeds = [
    {
      email: 'admin@na.edu',
      firstName: 'Admin',
      lastName: 'NAU',
      role: UserRole.ADMIN,
      isActive: true,
    },
    {
      email: 'student@na.edu',
      firstName: 'Test',
      lastName: 'Student',
      role: UserRole.STUDENT,
      isActive: true,
    },
  ];

  for (const data of seeds) {
    const existing = await usersRepo.findOne({ where: { email: data.email } });
    if (!existing) {
      const user = usersRepo.create(data);
      await usersRepo.save(user);
      console.log(`Created user: ${data.email} (${data.role})`);
    } else {
      console.log(`User already exists: ${data.email}`);
    }
  }

  await dataSource.destroy();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
