import "dotenv/config";

import { Temporal } from "@js-temporal/polyfill";

if (!("Temporal" in globalThis)) {
  Object.defineProperty(globalThis, "Temporal", {
    value: Temporal,
    writable: true,
    configurable: true,
  });
}

import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "./contract.json";

const db = postgres({
  contractJson,
  url: process.env.DATABASE_URL!,
});

// ================================
// IDENTITY TYPES
// ================================

const identities = [
  { name: "Student", slug: "student" },
  { name: "Builder", slug: "builder" },
  { name: "Creator", slug: "creator" },
  { name: "Developer", slug: "developer" },
  { name: "Designer", slug: "designer" },
  { name: "Entrepreneur", slug: "entrepreneur" },
  { name: "Researcher", slug: "researcher" },
  { name: "Professional", slug: "professional" },
  { name: "Freelancer", slug: "freelancer" },
  { name: "Educator", slug: "educator" },
  { name: "Artist", slug: "artist" },
  { name: "Explorer", slug: "explorer" },
  { name: "Other", slug: "other" },
];

// ================================
// CURIOSITY / SKILL DATA
// ================================

const skillCategories = [
  {
    name: "Technology",
    slug: "technology",
    skills: [
      "Python",
      "JavaScript",
      "AI/ML",
      "Cybersecurity",
      "Cloud",
      "DevOps",
      "Web Development",
    ],
  },

  {
    name: "Design & Creative",
    slug: "design-creative",
    skills: [
      "UI/UX",
      "Graphic Design",
      "Illustration",
      "3D",
      "Animation",
      "Architecture",
    ],
  },

  {
    name: "Media & Content",
    slug: "media-content",
    skills: [
      "Photography",
      "Videography",
      "Filmmaking",
      "Editing",
      "Storytelling",
      "Copywriting",
    ],
  },

  {
    name: "Business & Entrepreneurship",
    slug: "business-entrepreneurship",
    skills: [
      "Entrepreneurship",
      "Product Management",
      "Sales",
      "Marketing",
      "Negotiation",
    ],
  },

  {
    name: "Finance & Economics",
    slug: "finance-economics",
    skills: [
      "Investing",
      "Financial Analysis",
      "Economics",
      "Accounting",
      "Personal Finance",
    ],
  },

  {
    name: "Science & Research",
    slug: "science-research",
    skills: [
      "Physics",
      "Biology",
      "Chemistry",
      "Mathematics",
      "Research Methodology",
    ],
  },

  {
    name: "Thinking & Intellectual",
    slug: "thinking-intellectual",
    skills: [
      "Critical Thinking",
      "Problem Solving",
      "Logic",
      "Philosophy",
      "Decision Making",
    ],
  },

  {
    name: "Communication",
    slug: "communication",
    skills: [
      "Public Speaking",
      "Debate",
      "Writing",
      "Presentation",
      "Communication",
    ],
  },

  {
    name: "Languages & Culture",
    slug: "languages-culture",
    skills: [
      "English",
      "Hindi",
      "Gujarati",
      "Spanish",
      "Japanese",
      "Translation",
    ],
  },

  {
    name: "Arts & Performance",
    slug: "arts-performance",
    skills: [
      "Music",
      "Singing",
      "Guitar",
      "Piano",
      "Dance",
      "Acting",
      "Theatre",
    ],
  },

  {
    name: "Practical & Craft",
    slug: "practical-craft",
    skills: [
      "Woodworking",
      "Electronics",
      "Welding",
      "Cooking",
      "Gardening",
      "DIY",
    ],
  },

  {
    name: "Physical & Outdoor",
    slug: "physical-outdoor",
    skills: [
      "Running",
      "Cycling",
      "Trekking",
      "Swimming",
      "Yoga",
      "Martial Arts",
    ],
  },

  {
    name: "Leadership & Social",
    slug: "leadership-social",
    skills: [
      "Leadership",
      "Teamwork",
      "Mentoring",
      "Community Building",
    ],
  },

  {
    name: "Education & Teaching",
    slug: "education-teaching",
    skills: [
      "Teaching",
      "Tutoring",
      "Curriculum Design",
      "Knowledge Sharing",
    ],
  },

  {
    name: "Life & Personal Development",
    slug: "life-personal-development",
    skills: [
      "Time Management",
      "Productivity",
      "Habit Building",
      "Goal Setting",
    ],
  },
];

// ================================
// MAIN
// ================================

async function main() {
  await db.connect();

  // ----------------------------
  // Identity Types
  // ----------------------------

  for (const identity of identities) {
    await db.orm.public.IdentityType.upsert({
      create: identity,
      update: {},
      conflictOn: {
        slug: identity.slug,
      },
    });
  }

  console.log("✅ Identity types seeded successfully");

  // ----------------------------
  // Skill Categories + Skills
  // ----------------------------

  for (
    const [categoryIndex, category] of skillCategories.entries()
  ) {
    const skillCategory =
      await db.orm.public.SkillCategory.upsert({
        create: {
          name: category.name,
          slug: category.slug,
          sortOrder: categoryIndex,
          isActive: true,
        },

        update: {
          name: category.name,
          sortOrder: categoryIndex,
          isActive: true,
        },

        conflictOn: {
          slug: category.slug,
        },
      });

    // --------------------------
    // Skills
    // --------------------------

    for (const skillName of category.skills) {
      const skillSlug = skillName
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      await db.orm.public.Skill.upsert({
        create: {
          categoryId: skillCategory.id,
          name: skillName,
          slug: skillSlug,
          isActive: true,
        },

        update: {
          categoryId: skillCategory.id,
          name: skillName,
          slug: skillSlug,
          isActive: true,
        },

        conflictOn: {
          slug: skillSlug,
        },
      });
    }
  }

  console.log("✅ Skill categories and skills seeded successfully");
}

// ================================
// RUN
// ================================

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.close();
  });