export type Partner = {
  name: string;
  slug: string;
  website: string | null;
  logoUrl: string | null;
  tier: string | null;
  category: string | null;
  whatTheyDo: string | null;
  useCases: string[];
  booth: string | null;
  boothSource: string | null;
  year: number;
  sourceUrl: string | null;
  confidence: number;
  extractedAt: string | null;
};

export type Speaker = {
  name: string;
  /** Normalised, lowercased join key. Salutations/suffixes/accents stripped. */
  nameKey: string;
  title: string | null;
  org: string | null;
  bio: string | null;
  headshotUrl: string | null;
  linkedin: string | null;
  country: string | null;
  /** Agenda codes this speaker appears in — the reliable session join. */
  sessionCodes: string[];
  sessionTitle: string | null;
  year: number;
  sourceUrl: string | null;
};

export type Session = {
  agendaCode: string;
  documentId: string;
  title: string;
  description: string | null;
  /** ISO date, e.g. "2026-09-09". */
  day: string;
  /** 24h clock, e.g. "10:00". */
  startTime: string;
  endTime: string;
  /** Session hall, e.g. "Jasmine 3". NEVER a partner booth. */
  hall: string | null;
  format: string | null;
  track: string | null;
  accessType: "public" | "invite-only" | string;
  isClosedDoor: boolean;
  topics: string[];
  /** Display-case names; fold case before joining to Speaker.nameKey. */
  speakerNames: string[];
  hostNames: string[];
  year: number;
  sourceUrl: string | null;
};

export type Citation = {
  name: string;
  year: number;
  sourceUrl: string | null;
  booth: string | null;
};
