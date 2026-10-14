import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuthSession } from './auth-session.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 254 }) email!: string;
  @Column({ name: 'display_name', length: 120 }) displayName!: string;
  @Column({ name: 'password_hash', select: false }) passwordHash!: string;
  @Column({ length: 20 }) role!: 'ADMIN' | 'OPERATOR' | 'VIEWER';
  @Column({ length: 20 }) status!: 'ACTIVE' | 'LOCKED' | 'DISABLED';
  @Column({ name: 'failed_login_attempts', default: 0 })
  failedLoginAttempts!: number;
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;
  @OneToMany(() => AuthSession, (session) => session.user)
  sessions!: AuthSession[];
}
