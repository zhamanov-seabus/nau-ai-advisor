import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { User } from '../common/entities/user.entity';
import { OtpCode } from '../common/entities/otp-code.entity';
import { RefreshToken } from '../common/entities/refresh-token.entity';

@Injectable()
export class AuthService {
  private mailer: nodemailer.Transporter | null = null;

  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(OtpCode) private otpRepo: Repository<OtpCode>,
    @InjectRepository(RefreshToken) private refreshRepo: Repository<RefreshToken>,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');
    if (smtpUser && smtpPass) {
      this.mailer = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST', 'smtp.gmail.com'),
        port: this.config.get<number>('SMTP_PORT', 587),
        secure: false,
        auth: { user: smtpUser, pass: smtpPass },
      });
    }
  }

  async requestOtp(email: string): Promise<{ message: string; expires_in: number }> {
    const allowedDomains = this.config
      .get<string>('ALLOWED_EMAIL_DOMAINS', 'nau.edu')
      .split(',')
      .map((d) => d.trim());
    const domain = email.split('@')[1];
    if (!allowedDomains.includes(domain)) {
      throw new BadRequestException('Email domain not allowed');
    }

    let user = await this.usersRepo.findOne({ where: { email } });
    if (!user) {
      user = this.usersRepo.create({ email, firstName: '', lastName: '' });
      await this.usersRepo.save(user);
    }

    // Invalidate previous unused OTPs for this user
    await this.otpRepo.update(
      { userId: user.id, isUsed: false },
      { isUsed: true },
    );

    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.otpRepo.save(this.otpRepo.create({ userId: user.id, codeHash, expiresAt }));

    await this.sendOtpEmail(email, code);

    return {
      message: 'If this email is registered, you will receive a code',
      expires_in: 600,
    };
  }

  async verifyOtp(
    email: string,
    code: string,
  ): Promise<{ access_token: string; refresh_token: string; user: { id: string; email: string; role: string; first_name: string } }> {
    const user = await this.usersRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const otp = await this.otpRepo.findOne({
      where: { userId: user.id, isUsed: false },
      order: { createdAt: 'DESC' },
    });

    if (!otp || otp.expiresAt < new Date()) {
      throw new UnauthorizedException('OTP expired or not found');
    }

    if (otp.attempts >= 5) {
      otp.isUsed = true;
      await this.otpRepo.save(otp);
      throw new UnauthorizedException('Too many attempts. Request a new OTP');
    }

    const valid = await bcrypt.compare(code, otp.codeHash);
    if (!valid) {
      otp.attempts += 1;
      await this.otpRepo.save(otp);
      throw new UnauthorizedException('Invalid OTP');
    }

    otp.isUsed = true;
    await this.otpRepo.save(otp);

    return this.issueTokens(user);
  }

  async refreshTokens(
    token: string,
  ): Promise<{ access_token: string; refresh_token: string; user: { id: string; email: string; role: string; first_name: string } }> {
    const [recordId, rawToken] = this.parseCompoundToken(token);
    if (!recordId || !rawToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.refreshRepo.findOne({
      where: { id: recordId, revoked: false },
      relations: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const valid = await bcrypt.compare(rawToken, stored.tokenHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    stored.revoked = true;
    await this.refreshRepo.save(stored);

    return this.issueTokens(stored.user);
  }

  async logout(token: string): Promise<{ message: string }> {
    const [recordId, rawToken] = this.parseCompoundToken(token);
    if (!recordId || !rawToken) {
      return { message: 'Logged out' };
    }

    const stored = await this.refreshRepo.findOne({ where: { id: recordId, revoked: false } });
    if (stored) {
      const valid = await bcrypt.compare(rawToken, stored.tokenHash);
      if (valid) {
        stored.revoked = true;
        await this.refreshRepo.save(stored);
      }
    }

    return { message: 'Logged out' };
  }

  private async issueTokens(user: User): Promise<{
    access_token: string;
    refresh_token: string;
    user: { id: string; email: string; role: string; first_name: string };
  }> {
    const access_token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role });

    const rawToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const days = parseInt(this.config.get('REFRESH_TOKEN_EXPIRES_DAYS', '7'));
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const record = await this.refreshRepo.save(
      this.refreshRepo.create({ userId: user.id, tokenHash, expiresAt }),
    );

    // Compound token: recordId.rawToken — allows O(1) lookup without scanning all tokens
    const refresh_token = `${record.id}.${rawToken}`;

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.firstName,
      },
    };
  }

  private parseCompoundToken(token: string): [string, string] | [null, null] {
    const dotIndex = token.indexOf('.');
    if (dotIndex === -1) return [null, null];
    return [token.substring(0, dotIndex), token.substring(dotIndex + 1)];
  }

  private async sendOtpEmail(email: string, code: string): Promise<void> {
    if (!this.mailer) {
      console.log(`[DEV] OTP for ${email}: ${code}`);
      return;
    }

    try {
      await this.mailer.sendMail({
        from: this.config.get<string>('SMTP_USER', 'redacted@na.edu'),
        to: email,
        subject: 'Your NAU AI Advisor login code',
        html: `
          <h2>Your login code</h2>
          <p>Your one-time code is: <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p>
          <p>This code expires in 10 minutes. Do not share it with anyone.</p>
        `,
      });
      console.log(`[Auth] OTP email sent to ${email}`);
    } catch (err) {
      console.error('[Auth] Failed to send OTP email:', err);
      console.log(`[DEV] OTP for ${email}: ${code}`);
    }
  }
}
