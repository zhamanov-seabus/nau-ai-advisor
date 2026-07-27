import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  findAllUsers() {
    return this.adminService.findAllUsers();
  }

  @Patch('users/:id/role')
  setUserRole(@Param('id') id: string, @Body() body: { role: UserRole }) {
    return this.adminService.setUserRole(id, body.role);
  }

  @Patch('users/:id/active')
  toggleUserActive(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.adminService.toggleUserActive(id, body.isActive);
  }

  @Get('transcripts')
  findAllTranscripts() {
    return this.adminService.findAllTranscripts();
  }
}
