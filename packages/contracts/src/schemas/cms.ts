import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

// Every section carries a stable client-generated id (for React keys and reordering) and a type
// discriminant. WEEKLY_MENU and DELIVERY_ZONES are placement markers only — no content fields —
// because rendering them from stored copy would be a second source of truth for the actual menu
// and geography systems; the landing page resolves them live against the real endpoints instead.
const SectionBaseSchema = z.object({ id: z.string().min(1) });

const HeroSectionSchema = SectionBaseSchema.extend({
  ctaHref: z.string().trim().max(300).optional(),
  ctaLabel: z.string().trim().max(80).optional(),
  headline: z.string().trim().min(1).max(200),
  imageUrl: z.string().trim().max(2_000).optional(),
  subheadline: z.string().trim().max(500).optional(),
  type: z.literal('HERO'),
});

const TextSectionSchema = SectionBaseSchema.extend({
  body: z.string().trim().min(1).max(5_000),
  heading: z.string().trim().max(200).optional(),
  type: z.literal('TEXT'),
});

const ImageTextSectionSchema = SectionBaseSchema.extend({
  body: z.string().trim().min(1).max(2_000),
  heading: z.string().trim().max(200).optional(),
  imagePosition: z.enum(['left', 'right']).default('right'),
  imageUrl: z.string().trim().max(2_000),
  type: z.literal('IMAGE_TEXT'),
});

const StepsSectionSchema = SectionBaseSchema.extend({
  heading: z.string().trim().max(200).optional(),
  steps: z
    .array(
      z.object({
        body: z.string().trim().min(1).max(400),
        number: z.string().trim().min(1).max(10),
        title: z.string().trim().min(1).max(120),
      }),
    )
    .min(1)
    .max(8),
  type: z.literal('STEPS'),
});

const WeeklyMenuSectionSchema = SectionBaseSchema.extend({ type: z.literal('WEEKLY_MENU') });

const CtaSectionSchema = SectionBaseSchema.extend({
  body: z.string().trim().max(400).optional(),
  buttonHref: z.string().trim().min(1).max(300),
  buttonLabel: z.string().trim().min(1).max(80),
  heading: z.string().trim().min(1).max(200),
  type: z.literal('CTA'),
});

const FaqSectionSchema = SectionBaseSchema.extend({
  heading: z.string().trim().max(200).optional(),
  items: z
    .array(
      z.object({
        answer: z.string().trim().min(1).max(1_000),
        question: z.string().trim().min(1).max(300),
      }),
    )
    .min(1)
    .max(30),
  type: z.literal('FAQ'),
});

const DeliveryZonesSectionSchema = SectionBaseSchema.extend({
  heading: z.string().trim().max(200).optional(),
  type: z.literal('DELIVERY_ZONES'),
});

const ContactSectionSchema = SectionBaseSchema.extend({
  address: z.string().trim().max(300).optional(),
  email: z.string().trim().max(320).optional(),
  heading: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
  type: z.literal('CONTACT'),
  whatsapp: z.string().trim().max(60).optional(),
});

const GallerySectionSchema = SectionBaseSchema.extend({
  heading: z.string().trim().max(200).optional(),
  images: z
    .array(
      z.object({ alt: z.string().trim().max(200).optional(), url: z.string().trim().max(2_000) }),
    )
    .min(1)
    .max(30),
  type: z.literal('GALLERY'),
});

// Escape hatch for the "10% we didn't type" — raw HTML, editable only behind cms.edit (staff-only
// trust boundary, same as any admin-authored HTML block in most CMSes).
const CustomSectionSchema = SectionBaseSchema.extend({
  html: z.string().trim().min(1).max(20_000),
  type: z.literal('CUSTOM'),
});

export const PageSectionSchema = z.discriminatedUnion('type', [
  HeroSectionSchema,
  TextSectionSchema,
  ImageTextSectionSchema,
  StepsSectionSchema,
  WeeklyMenuSectionSchema,
  CtaSectionSchema,
  FaqSectionSchema,
  DeliveryZonesSectionSchema,
  ContactSectionSchema,
  GallerySectionSchema,
  CustomSectionSchema,
]);

export const PageSectionsSchema = z.array(PageSectionSchema).max(60);

export const PageSummarySchema = z.object({
  id: UuidSchema,
  publishedAt: IsoDateTimeSchema.nullable(),
  slug: z.string(),
  title: z.string(),
});

export const PageListResponseSchema = z.object({ items: z.array(PageSummarySchema) });

export const PageRevisionSchema = z.object({
  createdAt: IsoDateTimeSchema,
  createdByDisplayName: z.string().nullable(),
  id: UuidSchema,
  revision: z.number().int().positive(),
  sections: PageSectionsSchema,
});

export const PageDetailSchema = z.object({
  draft: PageRevisionSchema,
  id: UuidSchema,
  published: PageRevisionSchema.nullable(),
  slug: z.string(),
  title: z.string(),
});

export const PageRevisionListResponseSchema = z.object({
  items: z.array(PageRevisionSchema.omit({ sections: true })),
});

export const PagePublicResponseSchema = z.object({
  sections: PageSectionsSchema,
  slug: z.string(),
  title: z.string(),
});

export const PageCreateRequestSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(200),
});

export const PageDraftUpdateRequestSchema = z.object({
  sections: PageSectionsSchema,
});

export const PagePublishRequestSchema = z.object({
  revisionId: UuidSchema,
});

export const MediaAssetSchema = z.object({
  contentType: z.string(),
  createdAt: IsoDateTimeSchema,
  id: UuidSchema,
  label: z.string().nullable(),
  url: z.string(),
});

export const MediaAssetListResponseSchema = z.object({ items: z.array(MediaAssetSchema) });

export type PageSection = z.infer<typeof PageSectionSchema>;
export type PageCreateRequest = z.infer<typeof PageCreateRequestSchema>;
export type PageDraftUpdateRequest = z.infer<typeof PageDraftUpdateRequestSchema>;
export type PagePublishRequest = z.infer<typeof PagePublishRequestSchema>;
