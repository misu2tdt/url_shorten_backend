import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('urls') // Tên bảng trong Database sẽ là "urls"
export class Url {
  @PrimaryGeneratedColumn() 
  id!: number; // <-- Thêm dấu ! ở đây

  @Column({ type: 'text' }) 
  originalUrl!: string; // <-- Thêm dấu ! ở đây

  @Column({ length: 10, unique: true }) 
  shortCode!: string; // <-- Thêm dấu ! ở đây

  @CreateDateColumn() 
  createdAt!: Date; // <-- Thêm dấu ! ở đây
}