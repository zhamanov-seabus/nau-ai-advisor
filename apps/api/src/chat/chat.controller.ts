import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Throttle({ default: { ttl: 300000, limit: 20 } })
  @Post('message')
  async postMessage(
    @Request() req: { user: { id: string } },
    @Body() body: { message: string },
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of this.chatService.streamMessage(req.user.id, body.message)) {
        if (event.type === 'keepalive') {
          res.write(': keepalive\n\n');
        } else if (event.type === 'delta') {
          res.write(`data: ${JSON.stringify({ type: 'delta', content: event.content })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ type: 'done', tokens_used: event.tokensUsed })}\n\n`);
        }
      }
    } catch {
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: 'Stream error occurred' })}\n\n`,
      );
    }

    res.end();
  }

  @Get('history')
  async getHistory(@Request() req: { user: { id: string } }) {
    const messages = await this.chatService.getHistory(req.user.id);
    return { messages };
  }

  @Post('new-session')
  async newSession(@Request() req: { user: { id: string } }) {
    const session = await this.chatService.newSession(req.user.id);
    return { sessionId: session.id };
  }
}
