import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  Headers,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { PublicAdvisorService } from './public-advisor.service';

@ApiTags('public-advisor')
@Controller('public/advisor')
export class PublicAdvisorController {
  constructor(private readonly service: PublicAdvisorService) {}

  @Post('send-code')
  @ApiOperation({ summary: 'Send OTP code to student email' })
  sendCode(@Body() body: { email: string }) {
    if (!body.email) throw new BadRequestException('Email is required');
    return this.service.sendCode(body.email);
  }

  @Post('verify-code')
  @ApiOperation({ summary: 'Verify OTP code and get session token' })
  verifyCode(@Body() body: { email: string; code: string }) {
    if (!body.email || !body.code) throw new BadRequestException('Email and code are required');
    return this.service.verifyCode(body.email, body.code);
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI advisor (SSE stream)' })
  async chat(
    @Headers('authorization') auth: string,
    @Body() body: { message: string },
    @Res() res: Response,
  ): Promise<void> {
    const { email } = this.extractEmail(auth);
    if (!body.message?.trim()) {
      res.status(400).json({ message: 'Message is required' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of this.service.streamChat(email, body.message.trim())) {
        if (event.type === 'keepalive') {
          res.write(': keepalive\n\n');
        } else if (event.type === 'delta') {
          res.write(`data: ${JSON.stringify({ type: 'delta', content: event.content })}\n\n`);
        } else if (event.type === 'error') {
          res.write(`data: ${JSON.stringify({ type: 'error', message: event.message })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        }
      }
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? 'Stream error';
      res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
    }

    res.end();
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload transcript PDF (in-memory only)' })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Headers('authorization') auth: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const { email } = this.extractEmail(auth);
    if (!file) throw new BadRequestException('File is required');
    return this.service.uploadTranscript(email, file);
  }

  @Post('new-session')
  @ApiOperation({ summary: 'Clear chat history and start new conversation' })
  newSession(@Headers('authorization') auth: string) {
    const { email } = this.extractEmail(auth);
    return this.service.newSession(email);
  }

  @Get('session-info')
  @ApiOperation({ summary: 'Get current session info (message count, transcript status)' })
  sessionInfo(@Headers('authorization') auth: string) {
    const { email } = this.extractEmail(auth);
    return this.service.getSessionInfo(email);
  }

  private extractEmail(auth: string): { email: string } {
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new BadRequestException('Authorization header required');
    }
    const token = auth.slice(7);
    return this.service.validateSessionToken(token);
  }
}
