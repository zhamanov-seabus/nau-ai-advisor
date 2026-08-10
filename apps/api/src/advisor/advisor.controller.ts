import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Res,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AdvisorService } from './advisor.service';
import { TranscriptService } from '../transcript/transcript.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';

@ApiTags('advisor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADVISOR)
@Controller('advisor')
export class AdvisorController {
  constructor(
    private readonly advisorService: AdvisorService,
    private readonly transcriptService: TranscriptService,
  ) {}

  @Get('students')
  @ApiOperation({ summary: 'List all students with transcript status' })
  getStudents() {
    return this.advisorService.getStudents();
  }


  @Post('students')
  @ApiOperation({ summary: 'Create a new student (advisor use)' })
  createStudent(
    @Body() body: { firstName: string; lastName: string; email: string; department?: string },
  ) {
    return this.advisorService.createStudent(body);
  }

  @Post('upload/:studentId')
  @ApiOperation({ summary: 'Upload transcript or advising worksheet for a student' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadTranscript(
    @Param('studentId') studentId: string,
    @Request() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.transcriptService.uploadTranscript(file, studentId, req.user.id);
  }

  @Delete('upload/:studentId')
  @ApiOperation({ summary: 'Delete transcript for a student' })
  deleteTranscript(@Param('studentId') studentId: string) {
    return this.transcriptService.deleteTranscript(studentId);
  }

  @Get('chat/history/:studentId')
  @ApiOperation({ summary: "Get advisor's chat history for a student" })
  getHistory(
    @Request() req: { user: { id: string } },
    @Param('studentId') studentId: string,
  ) {
    return this.advisorService.getHistory(req.user.id, studentId);
  }

  @Post('chat/new-session/:studentId')
  @ApiOperation({ summary: 'Start a new advisor chat session for a student' })
  newSession(
    @Request() req: { user: { id: string } },
    @Param('studentId') studentId: string,
  ) {
    return this.advisorService.newSession(req.user.id, studentId);
  }

  @Throttle({ default: { ttl: 300000, limit: 30 } })
  @Post('chat/:studentId')
  @ApiOperation({ summary: 'Chat with AI about a specific student' })
  async chat(
    @Request() req: { user: { id: string } },
    @Param('studentId') studentId: string,
    @Body() body: { message: string },
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of this.advisorService.streamMessage(req.user.id, studentId, body.message)) {
        if (event.type === 'keepalive') {
          res.write(': keepalive\n\n');
        } else if (event.type === 'delta') {
          res.write(`data: ${JSON.stringify({ type: 'delta', content: event.content })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        }
      }
    } catch {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`);
    }

    res.end();
  }
}
