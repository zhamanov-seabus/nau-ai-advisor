import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';

@ApiTags('admin/knowledge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  findAll() {
    return this.knowledgeService.getDocuments();
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Request() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { description?: string },
  ) {
    return this.knowledgeService.indexDocument(file, body.description ?? '', req.user.id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.knowledgeService.deleteDocument(id);
  }

  @Post('seed')
  seed() {
    return this.knowledgeService.indexNAUKnowledgeBase();
  }
}
