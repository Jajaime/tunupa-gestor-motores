import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@tunupa.local' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 12, writeOnly: true })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
