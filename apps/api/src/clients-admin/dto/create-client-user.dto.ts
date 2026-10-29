import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateClientUserDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  displayName!: string;

  @IsString()
  @MinLength(14)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsIn(['VIEWER', 'OPERATOR'])
  role?: 'VIEWER' | 'OPERATOR';
}
