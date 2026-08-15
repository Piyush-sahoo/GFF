/**
 * Seed 50 DEMO attendees with shared plans, so /people and /meet have a
 * population to demonstrate against.
 *
 *   node --env-file=.env scripts/seed-demo-attendees.mjs
 *   node --env-file=.env scripts/seed-demo-attendees.mjs --delete
 *
 * Everything written here carries isDemo: true on BOTH the profile and the
 * plan, and every one of them is badged "Demo data" in the UI. They live in
 * the same Atlas database as real profiles, so the flag is the only thing
 * keeping the two apart — never write a demo row without it.
 *
 * IDENTITIES ARE FICTIONAL AND MUST STAY THAT WAY. Names, employers and
 * handles are invented. The handles use a deliberately non-resolving demo
 * namespace (demo-…-gff26, @demo_…_gff) because a plausible-looking handle
 * would very likely belong to a real living person, and this script would
 * then be attaching a fabricated employer and a fabricated three-day
 * timetable to them. The script refuses to run if any generated name collides
 * with a real GFF speaker or partner in the dataset.
 */
import { MongoClient } from "mongodb";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(HERE, "..", "data", f), "utf8"));

const SESSIONS = read("sessions-2026.json");
const SPEAKERS = read("speakers-2026.json");
const PARTNERS = read("partners-2026.json");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "gff";
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env scripts/seed-demo-attendees.mjs");
  process.exit(1);
}

const DEMO_DOMAIN = "demo.gff26.invalid"; // .invalid can never be a real domain

/* ----------------------------- identities ----------------------------- */

const FIRST = [
  "Ananya", "Rohit", "Kavya", "Devansh", "Meera", "Arjun", "Ishita", "Nikhil",
  "Sanjana", "Vikram", "Tara", "Aditya", "Nandini", "Karan", "Riya", "Siddharth",
  "Aarushi", "Manav", "Divya", "Rahul", "Sneha", "Yash", "Pooja", "Aryan",
  "Lakshmi", "Varun", "Neha", "Gaurav", "Shreya", "Abhishek", "Preeti", "Rajat",
  "Anjali", "Harsh", "Swati", "Kunal", "Ritika", "Vivek", "Madhuri", "Tanmay",
  "Sunita", "Akash", "Bhavna", "Nitin", "Chitra", "Sameer", "Payal", "Rohan",
  "Vaishali", "Kabir",
];

const LAST = [
  "Raghavan", "Bhatnagar", "Kulkarni", "Venkatesh", "Sengupta", "Chaturvedi",
  "Nadkarni", "Rajagopal", "Mukherjee", "Deshpande", "Iyengar", "Bhattacharya",
  "Sundaram", "Chandrasekar", "Ramanathan", "Sridharan", "Varadarajan",
  "Hegde", "Parthasarathy", "Balasubramanian", "Krishnamurthy", "Narasimhan",
  "Vaidyanathan", "Subramaniam", "Gopalakrishnan",
];

/** Invented orgs. Deliberately not any real fintech, bank or GFF partner. */
const ORGS = [
  "Tellurian Rails", "Bandhavgarh Systems", "Kestrel Ledger Labs",
  "Marigold Rails", "Sarus Payments Collective", "Indigo Meridian Tech",
  "Peregrine Credit Works", "Chinar Data Cooperative", "Sundial Ledger",
  "Antara Rails Studio", "Kalinga Signal Labs", "Nilgiri Trust Systems",
  "Chandratal Analytics", "Vermilion Rails", "Bhramari Credit Studio",
  "Konark Compute Collective", "Zephyr Ledger Guild", "Palash Data Works",
  "Rukmini Rails", "Ashwatth Systems Guild",
];

const ROLES = [
  "Head of Payments", "Founder", "Principal Engineer", "VP Risk",
  "Product Lead, Lending", "Chief Data Officer", "Director, Partnerships",
  "Head of Compliance", "Staff ML Engineer", "COO", "Head of Growth",
  "Platform Architect", "Credit Policy Lead", "Head of Fraud Analytics",
  "Director of Engineering",
];

/** The seven the brief asked for. Matched against real session topics below. */
const INTEREST_THEMES = [
  "Financial Inclusion", "Digital Public Infrastructure", "Agentic AI",
  "Digital Identity", "Cross-Border Payments", "Enterprise AI", "AI Governance",
];

const OBJECTIVES = [
  "Looking for banking partners for a merchant lending pilot.",
  "Mapping the agentic AI stack before we commit to a build.",
  "Hiring a fraud analytics lead and want to meet practitioners.",
  "Raising a seed round; want investors who understand credit risk.",
  "Scoping cross-border settlement for an SME corridor.",
  "Evaluating identity vendors for a re-KYC programme.",
  "Comparing notes on AI governance before our regulator review.",
  "Finding distribution partners in tier-2 and tier-3 markets.",
];

/** Deterministic pseudo-random so re-running produces the same 50 people. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function slugify(name, email) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return `${base}-${h.toString(36).slice(0, 4)}`;
}

const handleBase = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* -------------------------- session selection -------------------------- */

const bookable = SESSIONS.filter((s) => !s.isClosedDoor && s.accessType !== "invite-only");
const DAYS = [...new Set(SESSIONS.map((s) => s.day))].sort();
const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

function byDay(day) {
  return bookable.filter((s) => s.day === day).sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
}

function topicsOf(codes) {
  const t = new Set();
  for (const c of codes) {
    const s = bookable.find((x) => x.agendaCode === c);
    for (const x of s?.topics ?? []) t.add(x);
  }
  return [...t];
}

/** Sessions on a day that match a theme, by topic or title. */
function matching(day, theme) {
  const needle = theme.toLowerCase();
  return byDay(day).filter(
    (s) =>
      (s.topics ?? []).some((t) => t.toLowerCase().includes(needle)) ||
      s.title.toLowerCase().includes(needle),
  );
}

/**
 * Build 50 plans with deliberately different shapes, so every branch of
 * /meet is demonstrable:
 *   - anchors:  clusters that all share one specific session
 *   - loose:    afternoon-only plans, leaving a clean mutual morning window
 *   - packed:   dense plans that leave almost no gap
 *   - sparse:   one or two sessions, so most windows are free
 *   - empty-ish: a couple with a single session on one day only
 */
function buildPlan(i, rand) {
  const d1 = DAYS[0], d2 = DAYS[1], d3 = DAYS[2];
  const shape = i % 5;
  const codes = new Set();
  const pick = (list, n) => {
    for (let k = 0; k < n && list.length; k++) {
      codes.add(list[Math.floor(rand() * list.length)].agendaCode);
    }
  };

  // Cluster anchors: everyone in the same cluster shares one exact session,
  // which is what makes "sessions you are all already going to" non-empty.
  const cluster = i % 6;
  const anchorDay = [d1, d1, d2, d2, d3, d3][cluster];
  const anchorPool = byDay(anchorDay);
  if (anchorPool.length) {
    codes.add(anchorPool[cluster * 3 % anchorPool.length].agendaCode);
  }

  if (shape === 0) {
    // packed: morning through afternoon on two days
    pick(byDay(d1).slice(0, 8), 3);
    pick(byDay(d2).slice(0, 8), 3);
  } else if (shape === 1) {
    // loose: afternoon only, so mornings are a clean mutual window
    pick(byDay(d1).filter((s) => toMin(s.startTime) >= 14 * 60), 2);
    pick(byDay(d3).filter((s) => toMin(s.startTime) >= 14 * 60), 1);
  } else if (shape === 2) {
    // sparse: barely anything booked
    pick(byDay(d2), 1);
  } else if (shape === 3) {
    // themed: follows one interest across all three days
    const theme = INTEREST_THEMES[i % INTEREST_THEMES.length];
    for (const d of DAYS) pick(matching(d, theme), 1);
  } else {
    // mixed
    pick(byDay(d1), 2);
    pick(byDay(d3), 2);
  }

  return [...codes];
}

/* -------------------------------- main -------------------------------- */

const deleting = process.argv.includes("--delete");

const client = await new MongoClient(uri).connect();
const db = client.db(dbName);

if (deleting) {
  const p = await db.collection("profiles").deleteMany({ isDemo: true });
  const q = await db.collection("plans").deleteMany({ isDemo: true });
  const a = await db.collection("accounts").deleteMany({ email: { $regex: `@${DEMO_DOMAIN}$` } });
  console.log(`deleted: profiles=${p.deletedCount} plans=${q.deletedCount} accounts=${a.deletedCount}`);
  await client.close();
  process.exit(0);
}

// Collision guard. A demo identity that matches a real speaker or partner
// would attach a fabricated schedule to a real person or company.
const realNames = new Set([
  ...SPEAKERS.map((s) => (s.name || "").toLowerCase().trim()),
  ...SPEAKERS.map((s) => (s.nameKey || "").toLowerCase().trim()),
]);
const realOrgs = new Set([
  ...PARTNERS.map((p) => (p.name || "").toLowerCase().trim()),
  ...SPEAKERS.map((s) => (s.org || "").toLowerCase().trim()).filter(Boolean),
]);

const rand = rng(20260909);
const people = [];
const usedNames = new Set();

for (let i = 0; people.length < 50; i++) {
  const first = FIRST[i % FIRST.length];
  const last = LAST[(i * 7 + Math.floor(i / LAST.length)) % LAST.length];
  const name = `${first} ${last}`;
  if (usedNames.has(name)) continue;
  usedNames.add(name);

  if (realNames.has(name.toLowerCase())) {
    console.error(`REFUSING: generated name "${name}" collides with a real GFF speaker.`);
    process.exit(1);
  }
  const org = ORGS[i % ORGS.length];
  if (realOrgs.has(org.toLowerCase())) {
    console.error(`REFUSING: org "${org}" collides with a real GFF partner or speaker employer.`);
    process.exit(1);
  }
  people.push({ i: people.length, name, org });
}

const now = new Date().toISOString();
const profiles = [];
const plans = [];

for (const { i, name, org } of people) {
  const email = `demo.${handleBase(name)}@${DEMO_DOMAIN}`;
  const slug = slugify(name, email);
  const theme = INTEREST_THEMES[i % INTEREST_THEMES.length];
  const codes = buildPlan(i, rand);

  profiles.push({
    email,
    slug,
    name,
    org,
    role: ROLES[i % ROLES.length],
    // Non-resolving demo namespace on purpose — see the header comment.
    linkedin: `https://linkedin.com/in/demo-${handleBase(name)}-gff26`,
    x: `@demo_${handleBase(name).replace(/-/g, "_")}_gff`,
    interests: [theme, INTEREST_THEMES[(i + 3) % INTEREST_THEMES.length]],
    lookingFor: OBJECTIVES[i % OBJECTIVES.length],
    consentPublic: true,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  });

  plans.push({
    email,
    objective: OBJECTIVES[i % OBJECTIVES.length],
    sessions: codes,
    people: [],
    partners: [],
    source: Object.fromEntries(codes.map((c) => [c, "manual"])),
    why: Object.fromEntries(codes.map((c) => [c, `Matches their stated interest in ${theme.toLowerCase()}.`])),
    visibility: "shared",
    isDemo: true,
    updatedAt: now,
  });
}

// Sanity: no invite-only session may reach a plan.
const bookableCodes = new Set(bookable.map((s) => s.agendaCode));
for (const p of plans) {
  for (const c of p.sessions) {
    if (!bookableCodes.has(c)) {
      console.error(`REFUSING: plan for ${p.email} contains non-bookable session ${c}`);
      process.exit(1);
    }
  }
}

/**
 * Seeding is strictly additive: one upsert per demo email, no drop and no
 * deleteMany on this path. The counts either side are asserted rather than
 * assumed — if a future edit ever makes seeding destructive, this is what
 * catches it, instead of someone noticing their plan is gone.
 */
const realPlansBefore = await db.collection("plans").countDocuments({ isDemo: { $ne: true } });
const realProfilesBefore = await db.collection("profiles").countDocuments({ isDemo: { $ne: true } });

for (const p of profiles) {
  if (!p.isDemo) throw new Error(`refusing to write a profile without isDemo: ${p.email}`);
  await db.collection("profiles").replaceOne({ email: p.email }, p, { upsert: true });
}
for (const p of plans) {
  if (!p.isDemo) throw new Error(`refusing to write a plan without isDemo: ${p.email}`);
  await db.collection("plans").replaceOne({ email: p.email }, p, { upsert: true });
}

const realPlansAfter = await db.collection("plans").countDocuments({ isDemo: { $ne: true } });
const realProfilesAfter = await db.collection("profiles").countDocuments({ isDemo: { $ne: true } });
if (realPlansAfter !== realPlansBefore || realProfilesAfter !== realProfilesBefore) {
  console.error(
    `SEEDING TOUCHED REAL DATA — plans ${realPlansBefore}->${realPlansAfter}, profiles ${realProfilesBefore}->${realProfilesAfter}. This is a bug; report it.`,
  );
  process.exit(1);
}
console.log(`real (non-demo) rows untouched: ${realPlansBefore} plans, ${realProfilesBefore} profiles`);

const sizes = plans.map((p) => p.sessions.length);
console.log(`seeded ${profiles.length} demo profiles and ${plans.length} shared plans`);
console.log(`plan sizes: min ${Math.min(...sizes)}, max ${Math.max(...sizes)}, mean ${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)}`);
console.log(`topics covered: ${topicsOf(plans.flatMap((p) => p.sessions)).length}`);
console.log(`delete them all with: node --env-file=.env scripts/seed-demo-attendees.mjs --delete`);

await client.close();
