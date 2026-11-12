import { z } from 'zod';

// Component types for MVP
export const ComponentTypeSchema = z.enum([
  'number-reveal',
  'bar-chart',
  'line-chart',
  'comparison-split',
  'timeline',
  'map-globe',
  'kinetic-text',
  'logo-sting',
]);

export type ComponentType = z.infer<typeof ComponentTypeSchema>;

// Base component props that all components share
export const BaseComponentPropsSchema = z.object({
  duration: z.number().positive().min(1).max(30),
  brandColors: z.record(z.string()).optional(),
});

// Number Reveal Component
export const NumberRevealPropsSchema = BaseComponentPropsSchema.extend({
  value: z.number(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  comparisonDelta: z.number().optional(),
  comparisonLabel: z.string().optional(),
  contextLine: z.string().optional(),
  locale: z.string().default('en-US'),
  decimals: z.number().int().min(0).max(4).default(0),
});

export type NumberRevealProps = z.infer<typeof NumberRevealPropsSchema>;

// Bar Chart Component
export const BarChartDataPointSchema = z.object({
  label: z.string(),
  value: z.number(),
});

export const BarChartPropsSchema = BaseComponentPropsSchema.extend({
  title: z.string().optional(),
  data: z.array(BarChartDataPointSchema).min(1).max(20),
  orientation: z.enum(['vertical', 'horizontal']).default('vertical'),
  highlight: z.string().optional(), // label to highlight
  annotation: z.object({
    target: z.string(),
    text: z.string(),
  }).optional(),
  unit: z.string().optional(),
  locale: z.string().default('en-US'),
  source: z.string().optional(),
});

export type BarChartProps = z.infer<typeof BarChartPropsSchema>;

// Line Chart Component
export const LineChartDataPointSchema = z.object({
  label: z.string(),
  value: z.number(),
  marker: z.string().optional(), // event marker
});

export const LineChartPropsSchema = BaseComponentPropsSchema.extend({
  title: z.string().optional(),
  data: z.array(LineChartDataPointSchema).min(2).max(50),
  highlightSegment: z.object({
    from: z.string(),
    to: z.string(),
  }).optional(),
  areaFill: z.boolean().default(false),
  unit: z.string().optional(),
  locale: z.string().default('en-US'),
  source: z.string().optional(),
});

export type LineChartProps = z.infer<typeof LineChartPropsSchema>;

// Comparison Split Component
export const ComparisonSplitPropsSchema = BaseComponentPropsSchema.extend({
  itemA: z.object({
    label: z.string(),
    value: z.number().or(z.string()),
    icon: z.string().optional(), // emoji or icon name
  }),
  itemB: z.object({
    label: z.string(),
    value: z.number().or(z.string()),
    icon: z.string().optional(),
  }),
  winner: z.enum(['A', 'B', 'none']).optional(),
  context: z.string().optional(),
});

export type ComparisonSplitProps = z.infer<typeof ComparisonSplitPropsSchema>;

// Timeline Component
export const TimelineMilestoneSchema = z.object({
  date: z.string(),
  label: z.string(),
  description: z.string().optional(),
  emphasis: z.boolean().default(false),
});

export const TimelinePropsSchema = BaseComponentPropsSchema.extend({
  title: z.string().optional(),
  milestones: z.array(TimelineMilestoneSchema).min(2).max(10),
  orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
});

export type TimelineProps = z.infer<typeof TimelinePropsSchema>;

// Map/Globe Component
export const MapGlobePropsSchema = BaseComponentPropsSchema.extend({
  mode: z.enum(['globe-spin', 'country-highlight', 'route']).default('globe-spin'),
  targetCountry: z.string().optional(), // ISO country code
  targetCity: z.object({
    name: z.string(),
    lat: z.number(),
    lon: z.number(),
  }).optional(),
  route: z.array(z.object({
    from: z.object({ lat: z.number(), lon: z.number() }),
    to: z.object({ lat: z.number(), lon: z.number() }),
  })).optional(),
  label: z.string().optional(),
});

export type MapGlobeProps = z.infer<typeof MapGlobePropsSchema>;

// Kinetic Text Component
export const KineticTextPropsSchema = BaseComponentPropsSchema.extend({
  text: z.string(),
  emphasisWords: z.array(z.string()).optional(),
  style: z.enum(['headline', 'quote', 'keyword']).default('headline'),
  alignment: z.enum(['left', 'center', 'right']).default('center'),
});

export type KineticTextProps = z.infer<typeof KineticTextPropsSchema>;

// Logo Sting Component
export const LogoStingPropsSchema = BaseComponentPropsSchema.extend({
  logoUrl: z.string().url(),
  tagline: z.string().optional(),
  style: z.enum(['intro', 'outro', 'lower-third']).default('intro'),
  callToAction: z.object({
    text: z.string(),
    url: z.string().optional(),
  }).optional(),
});

export type LogoStingProps = z.infer<typeof LogoStingPropsSchema>;

// Union type for all component props
export const ComponentPropsSchema = z.discriminatedUnion('component', [
  z.object({ component: z.literal('number-reveal'), props: NumberRevealPropsSchema }),
  z.object({ component: z.literal('bar-chart'), props: BarChartPropsSchema }),
  z.object({ component: z.literal('line-chart'), props: LineChartPropsSchema }),
  z.object({ component: z.literal('comparison-split'), props: ComparisonSplitPropsSchema }),
  z.object({ component: z.literal('timeline'), props: TimelinePropsSchema }),
  z.object({ component: z.literal('map-globe'), props: MapGlobePropsSchema }),
  z.object({ component: z.literal('kinetic-text'), props: KineticTextPropsSchema }),
  z.object({ component: z.literal('logo-sting'), props: LogoStingPropsSchema }),
]);

export type ComponentProps = z.infer<typeof ComponentPropsSchema>;

// Component metadata for catalog
export const ComponentMetadataSchema = z.object({
  id: ComponentTypeSchema,
  name: z.string(),
  description: z.string(),
  examplePrompts: z.array(z.string()),
  compatibleSkills: z.array(z.string()),
  category: z.enum(['data-viz', 'text', 'branding', 'geography']),
});

export type ComponentMetadata = z.infer<typeof ComponentMetadataSchema>;
