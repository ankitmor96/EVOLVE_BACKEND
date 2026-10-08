import {
    IsInt,
    IsOptional,
    IsString,
    Length,
    Matches,
    Min,
} from 'class-validator';

export class CreateSkillDto {
    @IsInt()
    @Min(1)
    categoryId: number;

    @IsString()
    @Length(2, 100)
    name: string;

    @IsString()
    @Length(2, 100)
    @Matches(/^[a-z0-9-]+$/, {
        message:
            'Slug can contain only lowercase letters, numbers, and hyphens',
    })
    slug: string;

    @IsOptional()
    @IsString()
    description?: string;
}