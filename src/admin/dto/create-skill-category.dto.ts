import { IsString, Length, Matches, IsOptional, IsInt, Min } from 'class-validator';

export class CreateSkillCategoryDto {
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

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}