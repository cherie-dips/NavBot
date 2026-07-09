/**
 * Test routing only (no Gemini calls needed) for all screenshot queries.
 */
import "dotenv/config";
import { initAppDatabase } from "../src/services/db";
import { routeQuery } from "../src/services/query-router";

const SITE_ID = "plaksha.edu.in";

const QUERIES = [
  "Does financial aid cover only tuition fees or other expenses as well?",
  "If I receive financial aid in my first year, will it automatically continue in later years?",
  "If my family income is above ₹50 lakh but we still face financial constraints, what options do I have?",
  "My family's annual income is around ₹35 lakh. Should I still apply for financial aid?",
  "Do I need to submit separate applications for scholarships and financial aid?",
  "Can a student receive both a merit scholarship and need-based financial aid?",
  "If my financial situation changes after joining Plaksha, can I apply for aid later?",
  "What's the difference between the Merit Scholarship and the SP Dutt Award — can I apply for both?",
  "I have decent marks but not an exceptional profile. Should I even apply?",
  "I am currently studying outside India and the grading system is completely different. How would the admissions team evaluate my academic performance?",
  "Can i get admission though international level exams like SAT?",
  "I'm the first person in my family going to college. What should I know before applying?",
  "I'm currently at another engineering college — how does Plaksha's transfer admissions process work and what are the eligibility criteria?",
  "I'm confused between Computer Science Engineering, AI & Machine Learning, Data Science, and Cyber Security. Can you compare them based on curriculum, industry exposure, placements?",
  "I'm interested in AI, Cyber Security, and entrepreneurship. Which undergraduate program would be the best fit for me?",
  "Compare CSE AI/ML, Data Science, and Cyber Security based on placements, curriculum, internships, and future demand.",
  "Map every undergraduate program to the technical skills employers are likely to infer from the curriculum.",
  "Since AI is going to take over in future, will this degree still be valuable by the time I graduate?",
  "If I struggle with mathematics, which future parts of the curriculum become difficult based on prerequisite relationships?",
  "What does a typical week look like for a first-year BTech student at Plaksha?",
  "Which traditional engineering education practices has Plaksha intentionally chosen not to follow?",
  "What kinds of research problems are currently being worked on at Plaksha?",
  "Which research centres at Plaksha focus on Artificial Intelligence and Robotics?",
  "Can undergraduate students participate in research from their first year?",
  "Can students work with professors on independent research outside regular coursework?",
  "I'm interested in clean energy research. Which centres, labs, or faculty should I explore?",
  "How is the research culture at Plaksha?",
  "Can undergraduate students work in research labs or Centres of Excellence from their first year, or are these opportunities mainly for postgraduate students?",
  "If I want to pursue a PhD later, how can Plaksha help me build a strong research profile?",
  "I want to eventually pursue a PhD abroad. How should I plan my undergraduate journey at Plaksha?",
  "I want to start a company instead of taking a placement. How does Plaksha support student founders?",
  "I've never built a startup before. Can I still participate in entrepreneurship programs?",
  "I want to start a company during my BTech. What resources does Plaksha offer for student entrepreneurs?",
  "Are there any student-run startups that came out of Plaksha I can talk to or learn from?",
  "Show me every entrepreneurship-related opportunity scattered across the website and organize them into a four-year roadmap",
  "Create a four-year academic and career roadmap assuming I want to become an entrepreneur instead of taking placements.",
  "Beyond placements, what outcomes should students realistically expect after four years at Plaksha?",
  "I am a below average student, how can Plaksha help me become better and secure a nice package?",
  "If I want to become a product manager rather than a software engineer, which combination of courses and experiences on the website supports that path?",
  "Recommend the best program without considering placements. Now convince me using placement data.",
  "I am an introvert. Will i get any exposure?",
  "If I have anxiety about moving away from home, what campus support is available?",
  "I want to choose a university where I can balance academics, research, internships, hackathons, sports, and student clubs. How does your university support all these throughout the four years?",
  "What are the biggest academic adjustments students have to make after joining Plaksha?",
  "If my goal changes during college, how flexible is the Plaksha experience in helping me explore a different path?",
  "If I have only 20 hours a week outside class, what's the highest-return combination of opportunities based on everything on the website?",
  "I'm interested in studying abroad for one semester. What international opportunities, collaborations, or exchange programs are available?",
  "I want a campus where I can build startups. Is this college the right place?",
  "What would make Plaksha the wrong choice for me?",
  "How can I tell if I'm choosing Plaksha because it's genuinely right for me, or because it's new and exciting?",
  "I'm confused between Plaksha and other engineering colleges. Can you help me decide based on my profile instead of rankings?",
  "I don't want a college that's only good at marketing. How can I judge this college objectively?",
  "Trace a complete journey from admission to graduation for a student interested in AI, citing every relevant opportunity mentioned across the site.",
  "What important information is implied across multiple pages but never explicitly stated?",
];

async function main() {
  await initAppDatabase();

  let tier1 = 0;
  let tier2 = 0;
  let fallback = 0;

  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i]!;
    const route = await routeQuery(SITE_ID, q);
    const slugs = route.topics.map((t) => t.slug);
    const method = route.routingMethod;

    if (method === "tier1") tier1++;
    else if (method === "tier2") tier2++;
    else fallback++;

    console.log(`[${i + 1}] ${method} → [${slugs.join(", ")}]`);
    console.log(`    Q: ${q.slice(0, 100)}`);
  }

  console.log(`\n--- ROUTING SUMMARY ---`);
  console.log(`Tier 1 (free): ${tier1}/${QUERIES.length}`);
  console.log(`Tier 2 (LLM):  ${tier2}/${QUERIES.length}`);
  console.log(`Fallback:      ${fallback}/${QUERIES.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
