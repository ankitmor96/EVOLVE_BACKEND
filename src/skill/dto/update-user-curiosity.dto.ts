import {
  ArrayMinSize,
  IsArray,
  IsInt,
} from 'class-validator';

export class UpdateUserCuriosityDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  skillIds: number[];
}