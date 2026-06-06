// src/urls/entities/click.entity.ts

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Url } from './url.entity';

@Entity('clicks')
export class Click {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Url, (url) => url.clicks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'url_id' })
  url!: Url;

  @Index()
  @Column({ name: 'url_id' })
  urlId!: number;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'text', nullable: true })
  referrer!: string | null;

  @Index()
  @CreateDateColumn()
  clickedAt!: Date;
}