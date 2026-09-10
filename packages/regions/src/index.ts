/**
 * Region code → city, flag, continent, provider. Unknown codes fall back to the
 * caller's label under "Private". Client-safe, so not in db (server-only).
 */

export const CONTINENTS = [
  "North America",
  "South America",
  "Europe",
  "Africa",
  "Asia",
  "Oceania",
  "Private",
] as const;

export type Continent = (typeof CONTINENTS)[number];

export type RegionInfo = {
  code: string;
  /** "City, Country" — shown wherever there's room for more than the code. */
  location: string;
  flag: string;
  continent: Continent;
  /** Inferred from the code; a stored value passed in wins. */
  provider: string;
};

/** Fly's IATA codes plus AWS/GCP region names, keyed as stored. */
const CATALOGUE: Record<string, Omit<RegionInfo, "code">> = {
  // North America
  atl: {
    location: "Atlanta, Georgia, USA",
    flag: "🇺🇸",
    continent: "North America",
    provider: "fly",
  },
  bos: {
    location: "Boston, Massachusetts, USA",
    flag: "🇺🇸",
    continent: "North America",
    provider: "fly",
  },
  den: {
    location: "Denver, Colorado, USA",
    flag: "🇺🇸",
    continent: "North America",
    provider: "fly",
  },
  dfw: { location: "Dallas, Texas, USA", flag: "🇺🇸", continent: "North America", provider: "fly" },
  ewr: {
    location: "Secaucus, New Jersey, USA",
    flag: "🇺🇸",
    continent: "North America",
    provider: "fly",
  },
  iad: {
    location: "Ashburn, Virginia, USA",
    flag: "🇺🇸",
    continent: "North America",
    provider: "fly",
  },
  lax: {
    location: "Los Angeles, California, USA",
    flag: "🇺🇸",
    continent: "North America",
    provider: "fly",
  },
  mia: { location: "Miami, Florida, USA", flag: "🇺🇸", continent: "North America", provider: "fly" },
  ord: {
    location: "Chicago, Illinois, USA",
    flag: "🇺🇸",
    continent: "North America",
    provider: "fly",
  },
  phx: {
    location: "Phoenix, Arizona, USA",
    flag: "🇺🇸",
    continent: "North America",
    provider: "fly",
  },
  sea: {
    location: "Seattle, Washington, USA",
    flag: "🇺🇸",
    continent: "North America",
    provider: "fly",
  },
  sjc: {
    location: "San Jose, California, USA",
    flag: "🇺🇸",
    continent: "North America",
    provider: "fly",
  },
  yul: { location: "Montreal, Canada", flag: "🇨🇦", continent: "North America", provider: "fly" },
  yyz: { location: "Toronto, Canada", flag: "🇨🇦", continent: "North America", provider: "fly" },
  qro: { location: "Querétaro, Mexico", flag: "🇲🇽", continent: "North America", provider: "fly" },
  gdl: { location: "Guadalajara, Mexico", flag: "🇲🇽", continent: "North America", provider: "fly" },
  "us-east-1": {
    location: "N. Virginia, USA",
    flag: "🇺🇸",
    continent: "North America",
    provider: "aws",
  },
  "us-east-2": { location: "Ohio, USA", flag: "🇺🇸", continent: "North America", provider: "aws" },
  "us-west-1": {
    location: "N. California, USA",
    flag: "🇺🇸",
    continent: "North America",
    provider: "aws",
  },
  "us-west-2": { location: "Oregon, USA", flag: "🇺🇸", continent: "North America", provider: "aws" },

  // South America
  bog: { location: "Bogotá, Colombia", flag: "🇨🇴", continent: "South America", provider: "fly" },
  eze: {
    location: "Ezeiza, Argentina",
    flag: "🇦🇷",
    continent: "South America",
    provider: "fly",
  },
  gig: {
    location: "Rio de Janeiro, Brazil",
    flag: "🇧🇷",
    continent: "South America",
    provider: "fly",
  },
  gru: { location: "São Paulo, Brazil", flag: "🇧🇷", continent: "South America", provider: "fly" },
  scl: { location: "Santiago, Chile", flag: "🇨🇱", continent: "South America", provider: "fly" },
  "sa-east-1": {
    location: "São Paulo, Brazil",
    flag: "🇧🇷",
    continent: "South America",
    provider: "aws",
  },

  // Europe
  ams: { location: "Amsterdam, Netherlands", flag: "🇳🇱", continent: "Europe", provider: "fly" },
  arn: { location: "Stockholm, Sweden", flag: "🇸🇪", continent: "Europe", provider: "fly" },
  cdg: { location: "Paris, France", flag: "🇫🇷", continent: "Europe", provider: "fly" },
  fra: { location: "Frankfurt, Germany", flag: "🇩🇪", continent: "Europe", provider: "fly" },
  lhr: { location: "London, United Kingdom", flag: "🇬🇧", continent: "Europe", provider: "fly" },
  mad: { location: "Madrid, Spain", flag: "🇪🇸", continent: "Europe", provider: "fly" },
  otp: { location: "Bucharest, Romania", flag: "🇷🇴", continent: "Europe", provider: "fly" },
  waw: { location: "Warsaw, Poland", flag: "🇵🇱", continent: "Europe", provider: "fly" },
  "eu-central-1": {
    location: "Frankfurt, Germany",
    flag: "🇩🇪",
    continent: "Europe",
    provider: "aws",
  },
  "eu-west-1": { location: "Ireland", flag: "🇮🇪", continent: "Europe", provider: "aws" },
  "eu-west-2": {
    location: "London, United Kingdom",
    flag: "🇬🇧",
    continent: "Europe",
    provider: "aws",
  },
  "eu-north-1": { location: "Stockholm, Sweden", flag: "🇸🇪", continent: "Europe", provider: "aws" },

  // Africa
  jnb: { location: "Johannesburg, South Africa", flag: "🇿🇦", continent: "Africa", provider: "fly" },
  "af-south-1": {
    location: "Cape Town, South Africa",
    flag: "🇿🇦",
    continent: "Africa",
    provider: "aws",
  },

  // Asia
  bom: { location: "Mumbai, India", flag: "🇮🇳", continent: "Asia", provider: "fly" },
  hkg: { location: "Hong Kong", flag: "🇭🇰", continent: "Asia", provider: "fly" },
  nrt: { location: "Tokyo, Japan", flag: "🇯🇵", continent: "Asia", provider: "fly" },
  sin: { location: "Singapore", flag: "🇸🇬", continent: "Asia", provider: "fly" },
  sin1: { location: "Singapore", flag: "🇸🇬", continent: "Asia", provider: "vercel" },
  "ap-south-1": { location: "Mumbai, India", flag: "🇮🇳", continent: "Asia", provider: "aws" },
  "ap-northeast-1": { location: "Tokyo, Japan", flag: "🇯🇵", continent: "Asia", provider: "aws" },
  "ap-southeast-1": { location: "Singapore", flag: "🇸🇬", continent: "Asia", provider: "aws" },

  // Oceania
  syd: { location: "Sydney, Australia", flag: "🇦🇺", continent: "Oceania", provider: "fly" },
  "ap-southeast-2": {
    location: "Sydney, Australia",
    flag: "🇦🇺",
    continent: "Oceania",
    provider: "aws",
  },
};

/**
 * Metadata for a region code. Unknown codes get `label` (normally the probe
 * location's name) under the Private continent, so a self-hosted fleet reads
 * sensibly without anyone filling in a catalogue.
 */
export function getRegionInfo(
  code: string,
  opts?: { label?: string; provider?: string | null },
): RegionInfo {
  const known = CATALOGUE[code.toLowerCase()];
  if (known) return { code, ...known, provider: opts?.provider ?? known.provider };
  return {
    code,
    location: opts?.label ?? code,
    flag: "🌐",
    continent: "Private",
    provider: opts?.provider ?? "private",
  };
}

/**
 * Group arbitrary region codes by continent, resolving each through the
 * catalogue. Returns continents in CONTINENTS order with Private last, so a
 * picker renders known locations first.
 */
export function groupRegions<T extends { region: string; name?: string }>(
  items: T[],
): Array<{ continent: Continent; items: Array<T & { info: RegionInfo }> }> {
  const byContinent = new Map<Continent, Array<T & { info: RegionInfo }>>();
  for (const item of items) {
    const info = getRegionInfo(item.region, { label: item.name });
    const list = byContinent.get(info.continent) ?? [];
    list.push({ ...item, info });
    byContinent.set(info.continent, list);
  }
  return CONTINENTS.filter((c) => byContinent.has(c)).map((continent) => ({
    continent,
    items: byContinent.get(continent) ?? [],
  }));
}
