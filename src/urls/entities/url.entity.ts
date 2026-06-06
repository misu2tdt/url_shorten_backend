// src/urls/entities/url.entity.ts

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Click } from './click.entity';

@Entity('urls')
export class Url {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  originalUrl!: string;

  @Index()
  @Column({ length: 20, unique: true })
  shortCode!: string;   
  
  @Column({ type: 'varchar', length: 50, nullable: true })
  customAlias!: string | null;

  @Column({ type: 'int', default: 0 })
  clickCount!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // ============ QUAN HỆ ============

  @OneToMany(() => Click, (click) => click.url)
  clicks!: Click[];
}