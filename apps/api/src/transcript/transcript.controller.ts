import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
} from '@nestjs/swagger';
import { TranscriptService } from './transcript.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';
import { TranscriptStatus } from '../common/entities/transcript.entity';

// ─── Admin endpoints ──────────────────────────────────────────────────────────

@ApiTags('admin-transcripts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/transcripts')
export class TranscriptAdminController {
  constructor(private readonly transcriptService: TranscriptService) {}

  @Post(':studentId')
  @ApiOperation({ summary: 'Upload transcript PDF for a student' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadForStudent(
    @Param('studentId') studentId: string,
    @Request() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.transcriptService.uploadTranscript(file, studentId, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List all students with transcript statuses' })
  getAllStatuses(
    @Query('status') status?: TranscriptStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.transcriptService.getAllTranscriptStatuses({ status, page, limit });
  }

  @Get(':studentId/status')
  @ApiOperation({ summary: 'Get transcript status for a specific student' })
  getStudentStatus(@Param('studentId') studentId: string) {
    return this.transcriptService.getTranscriptStatus(studentId);
  }

  @Delete(':studentId')
  @ApiOperation({ summary: 'Delete a student transcript' })
  deleteStudentTranscript(@Param('studentId') studentId: string) {
    return this.transcriptService.deleteTranscript(studentId);
  }
}

// ─── Student endpoints ────────────────────────────────────────────────────────

@ApiTags('transcript')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transcript')
export class TranscriptController {
  constructor(private readonly transcriptService: TranscriptService) {}

  @Get('me')
  @ApiOperation({ summary: "Get own transcript status (student view)" })
  async getMyStatus(@Request() req: { user: { id: string } }) {
    const result = await this.transcriptService.getTranscriptStatus(req.user.id);
    // Students only see ready/not_uploaded — no raw data
    if (!result.uploadedAt) {
      return { status: 'not_uploaded' };
    }
    return { status: result.status, uploadedAt: result.uploadedAt };
  }
}
