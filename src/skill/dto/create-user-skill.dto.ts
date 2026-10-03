import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum SkillRelationshipType {
  CAN_DO = 'CAN_DO',
  LEARNING = 'LEARNING',
  WANT_TO_IMPROVE = 'WANT_TO_IMPROVE',
}

export class CreateUserSkillDto {
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return JSON.parse(value);
    }
    return value;
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  skill: number[];

  @IsEnum(SkillRelationshipType)
  relationshipType: SkillRelationshipType;
}