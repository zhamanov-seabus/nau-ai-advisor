import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';

@WebSocketGateway({ cors: true, namespace: '/' })
export class TranscriptGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TranscriptGateway.name);
  private subscriber: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.subscriber = new Redis(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');

    void this.subscriber.subscribe('transcript:status');

    this.subscriber.on('message', (_channel: string, message: string) => {
      try {
        const data = JSON.parse(message) as {
          transcriptId: string;
          status: string;
          timestamp: string;
        };
        this.server.emit('transcript-status', data);
      } catch (err) {
        this.logger.warn('Failed to parse Redis message', err);
      }
    });
  }

  onModuleDestroy(): void {
    void this.subscriber.quit();
  }

  afterInit(_server: Server): void {
    this.logger.log('TranscriptGateway initialized');
  }

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }
}
