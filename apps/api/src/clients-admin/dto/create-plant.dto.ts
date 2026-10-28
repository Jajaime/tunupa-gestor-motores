import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePlantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
}
