import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class SubtitleCueDto {
  @IsNumber() @Min(0) start: number;
  @IsNumber() @Min(0) end: number;
  @IsString() @IsNotEmpty() @MaxLength(200) text: string;
}

export class CreateRenderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  clips: string[];

  @IsOptional() @IsString() audio?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubtitleCueDto)
  subtitles?: SubtitleCueDto[];
}
