/**
 * Per-site tuning. Deliberately NOT generic: this is fitted to plaksha.edu.in,
 * which is the deployment target. Other sites fall back to DEFAULT_PROFILE and
 * still work, they just do not get the site-specific routing and vocabulary.
 *
 * Everything here was derived from the live index (526 tracked URLs, 4,656 chunks),
 * not assumed.
 */

export interface ContactEntry {
  /** Matched against the user's question to pick the right desk. */
  topic: RegExp;
  label: string;
  email: string;
  phone?: string;
  page?: string;
}

export interface SectionAlias {
  /** What the visitor calls it. */
  match: RegExp;
  /** Where it actually lives on this site. */
  pathPatterns: RegExp[];
  /** Human label used when explaining where we looked. */
  label: string;
}

export interface SiteProfile {
  siteId: string;
  displayName: string;
  /** Menu labels used to identify navigation chunks. Lowercase. */
  navigationLabels: string[];
  /** When the same text appears at several URLs, earlier paths win. */
  canonicalPreference: string[];
  /** Visitor vocabulary -> real site sections. */
  sectionAliases: SectionAlias[];
  /** Fallback contacts, most specific first. */
  contacts: ContactEntry[];
  generalContact: ContactEntry;
  /** Spelling and terminology normalisation applied to every answer. */
  glossary: Array<[RegExp, string]>;
  /** Topics the bot should answer about; anything else is out of scope. */
  scopeDescription: string;
  /** Compact section map handed to the planner. */
  sectionMap: string;
}

const PLAKSHA: SiteProfile = {
  siteId: "plaksha.edu.in",
  displayName: "Plaksha University",

  navigationLabels: [
    "careers at plaksha",
    "intranet",
    "public self disclosure",
    "my-plaksha",
    "in the press",
    "reach us",
    "regular admissions",
    "transfer admissions",
    "scholarships & financial aid",
    "merit scholarship",
    "need based financial aid",
    "campus & spaces",
    "student clubs",
    "young tech scholars",
    "undergraduate degrees",
    "graduate degrees",
    "minor in tech entrepreneurship",
    "grand challenge scholars program",
    "axis bank futuretech building",
    "ds brar center",
    "btech program",
    "tech leaders fellowship",
    "alumni",
    "contact us",
  ],

  // /financial-aid and /scholarship serve identical content; /admissions over /lps landing pages.
  canonicalPreference: [
    "/financial-aid",
    "/admissions",
    "/about-us",
    "/career-pathways",
    "/ug",
    "/faqs",
  ],

  sectionAliases: [
    {
      match: /\b(placement|recruit|hiring|compan(?:y|ies)|career outcome|job|package|salary|ctc|employer|where do graduates)\b/i,
      pathPatterns: [/^\/career-pathways/, /^\/statements\/.*placement/, /^\/statements\/.*convocation/, /^\/blog\/.*(?:graduating-class|placement|career)/],
      label: "career outcomes",
    },
    {
      match: /\b(campus life|hostel|accommodation|residence|dorm|mess|dining|student life|club|facilit|infrastructure|building|lab|library|sports|gym)\b/i,
      pathPatterns: [/^\/gallery/, /^\/axis-bank-futuretech-building/, /^\/ds-brar-center/, /^\/research-labs-facilities/, /^\/robotics-lab/, /^\/well-being/, /^\/blog\/.*(?:campus|student-life|life-at-plaksha)/],
      label: "campus and facilities",
    },
    {
      match: /\b(scholarship|financial aid|fee|tuition|cost|funding|loan|waiver|afford|bharti)\b/i,
      pathPatterns: [/^\/financial-aid/, /^\/scholarship/, /^\/bharti-scholarship/, /^\/admissions/],
      label: "fees and financial aid",
    },
    {
      match: /\b(admission|apply|application|deadline|eligibility|entrance|round|transfer)\b/i,
      pathPatterns: [/^\/admissions/, /^\/lps\//, /^\/ug$/, /^\/faqs/],
      label: "admissions",
    },
    {
      match: /\b(btech|b\.tech|undergraduate|ug|degree|major|specialization|curriculum|syllabus|course)\b/i,
      pathPatterns: [/^\/ug/, /^\/course-details\/ug/, /^\/programs\/undergraduate/, /^\/academic-office/],
      label: "undergraduate programs",
    },
    {
      match: /\b(masters|m\.?s\.?|postgraduate|pg|fellowship|tech leaders|tlf|phd|doctoral|research fellowship)\b/i,
      pathPatterns: [/^\/ms/, /^\/pg/, /^\/phd/, /^\/plaksha-research-fellowship/],
      label: "graduate programs",
    },
    {
      match: /\b(faculty|professor|teacher|instructor|researcher|dean|academic staff)\b/i,
      pathPatterns: [/^\/faculty/, /^\/faculty-details/, /^\/academic-leadership/, /^\/university-leadership/],
      label: "faculty",
    },
    {
      match: /\b(research|centre|center|lab|publication|innovation|institute|school of)\b/i,
      pathPatterns: [/^\/intermediate\/centers/, /^\/office-of-research/, /^\/center-for-/, /^\/ds-brar-center/, /^\/harish-bina-shah-school/, /^\/binny-bansal-institute/, /^\/research-labs-facilities/, /^\/robotics-lab/, /^\/research-advisory-council/],
      label: "research centers",
    },
    {
      match: /\b(leadership|founder|trustee|board|governance|team|who runs|vice chancellor|president)\b/i,
      pathPatterns: [/^\/team/, /^\/team-details/, /^\/leadership-details/, /^\/university-leadership/, /^\/about-us/],
      label: "leadership and team",
    },
    {
      match: /\b(about|history|mission|vision|values|founded|why plaksha|overview)\b/i,
      pathPatterns: [/^\/about-us/, /^\/plaksha-values/, /^\/statements/],
      label: "about the university",
    },
    {
      match: /\b(international|global|exchange|abroad|partner universit|collaboration|mou)\b/i,
      pathPatterns: [/^\/office-of-global-engagements/, /^\/oge/, /^\/partnerships/, /^\/statements\/.*(?:mou|upenn)/],
      label: "global engagements",
    },
  ],

  contacts: [
    {
      topic: /\b(admission|apply|application|deadline|eligibility|btech|undergraduate|transfer|entrance)\b/i,
      label: "UG Admissions",
      email: "apply@plaksha.edu.in",
      phone: "+91 63928 78527",
      page: "https://plaksha.edu.in/admissions",
    },
    {
      topic: /\b(phd|doctoral|research scholar)\b/i,
      label: "PhD Admissions",
      email: "phd.academics@plaksha.edu.in",
      phone: "+91 172 412 6360",
      page: "https://plaksha.edu.in/phd",
    },
    {
      topic: /\b(young tech scholar|high school|summer program|school student)\b/i,
      label: "Young Technology Scholars",
      email: "youngtechscholars@plaksha.edu.in",
      phone: "+91 73035 80960",
      page: "https://plaksha.edu.in/hs/young-technology-scholars",
    },
    {
      topic: /\b(faculty position|academic job|teaching position|recruitment|work at plaksha|hiring)\b/i,
      label: "Academic Relations and Faculty Recruitment",
      email: "academic.relations@plaksha.edu.in",
      phone: "+91 172 412 6401",
      page: "https://plaksha.edu.in/faculty-open-positions",
    },
    {
      topic: /\b(scholarship|financial aid|fee|tuition|loan|waiver)\b/i,
      label: "UG Admissions (fees and financial aid)",
      email: "apply@plaksha.edu.in",
      phone: "+91 63928 78527",
      page: "https://plaksha.edu.in/financial-aid",
    },
    {
      // Wellbeing questions are often asked in the first person and emotionally
      // ("I'm anxious about moving away from home"), so this matches how students
      // actually write, not just the institutional vocabulary on the page.
      topic:
        /\b(student life|well-?being|counsel(?:l)?(?:or|ing)|therapy|therapist|mental health|anxiety|anxious|stress(?:ed)?|depress|lonely|loneliness|homesick|overwhelmed|burn ?out|support (?:system|service)|pastoral|hostel|campus life|club|settling in|first ?year)\b/i,
      label: "Student Life and Wellbeing",
      email: "studentlife@plaksha.edu.in",
      phone: "+91 98759 90805",
      page: "https://plaksha.edu.in/well-being",
    },
    {
      topic: /\b(global|international|exchange|abroad|partnership)\b/i,
      label: "Office of Global Engagements",
      email: "global.engagements@plaksha.edu.in",
      page: "https://plaksha.edu.in/office-of-global-engagements",
    },
  ],

  generalContact: {
    topic: /.*/,
    label: "Plaksha University",
    email: "info@plaksha.edu.in",
    phone: "+91 172 412 6260",
    page: "https://plaksha.edu.in/contact-us",
  },

  // American English plus Plaksha's own house terms.
  glossary: [
    [/\bprogramme(s?)\b/gi, "program$1"],
    [/\bcentre(s?)\b/gi, "center$1"],
    [/\bspecialis(e|ed|ing|ation|ations)\b/gi, "specializ$1"],
    [/\borganis(e|ed|ing|ation|ations)\b/gi, "organiz$1"],
    [/\brecognis(e|ed|ing)\b/gi, "recogniz$1"],
    [/\bemphasis(e|ed|ing)\b/gi, "emphasiz$1"],
    [/\banalyse(d|s)?\b/gi, "analyze$1"],
    [/\bcatalogue(s?)\b/gi, "catalog$1"],
    [/\bfavour(s|ed|ite|able)?\b/gi, "favor$1"],
    [/\bhonour(s|ed|able)?\b/gi, "honor$1"],
    [/\blabour(s|ed)?\b/gi, "labor$1"],
    [/\benrolment\b/gi, "enrollment"],
    [/\bpractise\b/gi, "practice"],
    [/\btowards\b/gi, "toward"],
    [/\bB\.?\s?Tech\b/g, "BTech"],
    [/\bPlaksha university\b/g, "Plaksha University"],
  ],

  scopeDescription:
    "Plaksha University — its undergraduate (BTech), graduate (MS, Tech Leaders Fellowship, PhD) and high-school programs, admissions, fees and financial aid, curriculum, faculty, research centers, campus and student life, career outcomes, leadership, and university news.",

  sectionMap: [
    "/admissions, /admissions/transfer — BTech admission rounds, deadlines, eligibility, application process",
    "/financial-aid, /scholarship, /bharti-scholarship — fees, merit scholarships, need-based aid, education loans",
    "/ug, /ug/btech-degree/<program> — the four BTech degrees, curriculum, what students build",
    "/course-details/ug/<program> — detailed course listings per BTech degree",
    "/ms/artificial-intelligence/* , /pg/tech-leaders-fellowship/* , /pg/technology-leaders-program, /phd — graduate programs",
    "/hs/young-technology-scholars, /faqs/young-tech-scholars — high-school summer program",
    "/faculty/* (adjunct, guest, visiting, full-time), /faculty-details/<name> — faculty profiles",
    "/team, /team-details/<name>, /leadership-details/<name>, /university-leadership, /academic-leadership — leadership, trustees, founding group",
    "/career-pathways, /statements/plaksha-placement-outcomes-2025, /statements/plaksha-first-undergraduate-convocation — placements and career outcomes",
    "/intermediate/centers, /center-for-clean-energy, /center-for-water-security, /center-for-entrepreneurship, /ds-brar-center, /office-of-research, /research-labs-facilities, /robotics-lab — research centers and labs",
    "/harish-bina-shah-school-of-ai-computer-science, /binny-bansal-institute-for-inventing-future — named schools and institutes",
    "/gallery/campus, /gallery/hostel, /gallery/labs, /gallery/classroom — campus, hostel and lab facilities",
    "/axis-bank-futuretech-building — the main academic building",
    "/about-us, /plaksha-values, /grand-challenge-scholars-program — mission, history, values",
    "/well-being, /career-pathways — student wellbeing and career services",
    "/office-of-global-engagements, /oge, /partnerships — international collaborations",
    "/faqs — frequently asked questions",
    "/contact-us — all department contacts",
    "/blog/<slug> (176 posts), /statements/<slug>, /newsletters/* — news, student stories, announcements",
  ].join("\n"),
};

const DEFAULT_PROFILE: SiteProfile = {
  siteId: "default",
  displayName: "",
  navigationLabels: ["contact us", "about us", "home", "search", "privacy policy", "terms", "careers", "sitemap", "login", "sign up"],
  canonicalPreference: [],
  sectionAliases: [],
  contacts: [],
  generalContact: { topic: /.*/, label: "", email: "", page: "" },
  glossary: [],
  scopeDescription: "",
  sectionMap: "",
};

const PROFILES: Record<string, SiteProfile> = {
  "plaksha.edu.in": PLAKSHA,
};

export function getSiteProfile(siteId: string): SiteProfile {
  return PROFILES[siteId] ?? { ...DEFAULT_PROFILE, siteId, displayName: siteId };
}

export function hasTunedProfile(siteId: string): boolean {
  return siteId in PROFILES;
}

/** Path patterns for the sections a question is about. */
export function sectionsForQuestion(siteId: string, question: string): { patterns: RegExp[]; labels: string[] } {
  const profile = getSiteProfile(siteId);
  const patterns: RegExp[] = [];
  const labels: string[] = [];
  for (const alias of profile.sectionAliases) {
    if (alias.match.test(question)) {
      patterns.push(...alias.pathPatterns);
      labels.push(alias.label);
    }
  }
  return { patterns, labels };
}

/** The contact desk that best fits the question, for the fallback ladder. */
export function contactForQuestion(siteId: string, question: string): ContactEntry {
  const profile = getSiteProfile(siteId);
  for (const c of profile.contacts) {
    if (c.topic.test(question)) return c;
  }
  return profile.generalContact;
}

export function applyGlossary(text: string, siteId: string): string {
  const profile = getSiteProfile(siteId);
  let out = text;
  for (const [pattern, replacement] of profile.glossary) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
