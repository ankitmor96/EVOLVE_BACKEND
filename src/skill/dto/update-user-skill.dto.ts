import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
} from 'class-validator';
import { Transform } from 'class-transformer';

import { SkillRelationshipType } from './create-user-skill.dto';

export class UpdateUserSkillDto {
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