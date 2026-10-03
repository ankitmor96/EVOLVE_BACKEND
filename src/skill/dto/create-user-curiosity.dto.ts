import {
  ArrayMinSize,
  IsArray,
  IsInt,
} from 'class-validator';

export class CreateUserCuriosityDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  skillIds: number[];
}