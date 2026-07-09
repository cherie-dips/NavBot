/**
 * Patch knowledge topics with missing information identified from testing.
 * Usage: pnpm --filter api exec tsx scripts/patch-topics.ts
 */
import "dotenv/config";
import {
  initAppDatabase,
  getKnowledgeTopicsBySlugs,
  upsertKnowledgeTopic,
} from "../src/services/db";

const SITE_ID = "plaksha.edu.in";

const PATCHES: Record<string, string> = {
  "fees-financial-aid": `

## Frequently Asked Questions

### Can I receive both a merit scholarship and need-based financial aid?
Yes, students can receive both merit scholarships and need-based financial aid simultaneously. Plaksha offers liberal financial aid and merit scholarships, with support ranging from 25% to 100% for deserving students. 33.7% of students have received a full tuition waiver under combined merit scholarship and financial aid. The total support package is determined holistically based on both academic merit and financial need.

### Can I apply for financial aid after joining Plaksha if my financial situation changes?
Scholarships awarded at the time of admission are for the first year of study. Subsequently, students must apply at the end of each academic year for the continuation of the scholarship for the upcoming year. Renewal is contingent upon meeting academic and other criteria outlined in the annually released Scholarship Guidelines. If your family's financial situation changes after joining, you can apply for need-based financial aid during the annual renewal cycle.

### What if my family income is above ₹50 lakh?
If your family's gross annual income is above INR 50 lakh, you are not eligible for need-based financial aid. However, you may still qualify for:
• **Merit Scholarships** — if you scored 95–100% in board exams or 95th–100th percentile in JEE
• **Bharti Scholarship** — based on holistic evaluation including financial need
• **Education Loans** — Plaksha partners with Propelld, Axis Bank, Credila, ICICI Bank, and Avanse for education loans with competitive interest rates, collateral-free options, and flexible repayment terms
• If your income is between INR 50 lakh and INR 75 lakh, you may be eligible for an interest-free loan on 25% of the tuition fee from Plaksha-approved loan providers`,

  admissions: `

## International Examinations
Plaksha's admission process does not currently use SAT, ACT, or other international standardized test scores as part of its selection criteria. The eligibility is based on completing Grade 12 from a recognized National or International board or equivalent qualification from a board recognized by the Association of Indian Universities (AIU). For foreign nationals, an equivalent qualification from a foreign educational institution must be accredited by an appropriate authority.

Plaksha follows a holistic admissions process that evaluates candidates beyond just marks — looking at curiosity, problem-solving ability, interdisciplinary thinking, and leadership potential through interviews and personal essays, rather than relying on standardized test scores.

For applicants from IB, A-Level, or other international curricula, the admissions team evaluates academic performance within the context of your specific grading system. An English proficiency test score may be required if applicable.`,

  "campus-life": `

## Support for All Student Types

### For Introverted Students
Plaksha offers many avenues for exposure and growth, even for introverted students, through its structured programs and campus environment:
• **Collaborative Learning:** The university emphasizes an interdisciplinary mindset, with courses in communication, design thinking, economics, and liberal arts. Students engage in team-based projects, such as the Innovation Lab & Grand Challenge Studio, providing structured exposure in supportive settings.
• **Small Cohort Size:** With a small student body, Plaksha fosters a close-knit community where students can build meaningful connections at their own pace.
• **Faculty Mentorship:** Each student is paired with a faculty mentor for personalized guidance, offering a comfortable one-on-one setting.
• **Diverse Activities:** From clubs and societies to hackathons and research projects, students can choose their level of engagement and gradually expand their comfort zone.

### Flexibility to Change Paths
If your goals change during college, the Plaksha experience offers significant flexibility:
• **Major Exploration:** In the first year (Freshmore), all students share a common interdisciplinary curriculum. You don't declare a major until Year 2, giving you time to explore.
• **Faculty Guidance:** In your second year, you will be guided by a faculty advisor when making the important decision of choosing your major.
• **Interdisciplinary Curriculum:** All programs share foundational courses in technology, social sciences, design, and liberal arts, making transitions between related programs smoother.
• **Minor in Tech Entrepreneurship:** Available across all programs, so you can add entrepreneurial skills regardless of your major.
• **Research Flexibility:** You can work with faculty from any department on research projects, not just your own major.

### Homesickness & Moving Away
For students anxious about moving away from home:
• **Wellness Center:** Professional counselors are available (Zoya Merchant: Mon/Wed, Sanamjeet Virdi: Tue/Thu) for personal, academic, and emotional support.
• **Wellbeing Boot Camp:** Campus events featuring reflective activities, fort building, and appreciation cards to promote mental health.
• **Small, Supportive Campus:** The intimate campus environment and small cohort create a family-like atmosphere.
• **Regular Events:** Festivals like Fitoor, clubs, and student activities help build strong social bonds quickly.`,

  "undergraduate-programs": `

## Undergraduate Research Opportunities

Students at Plaksha can participate in research from their very first year through multiple pathways:

### Year 1 Research
• **Innovation Lab & Grand Challenge Studio:** From day one, students work on real-world problems aligned with UN Sustainable Development Goals through interdisciplinary project-based learning.
• **Faculty Mentorship:** Each student is paired with a faculty mentor who can involve them in ongoing research projects.

### Year 2-4 Research
• **Research Centers:** Students can join research projects at the Binny Bansal Institute for Inventing the Future, Center for Clean Energy, Center for Water Security, Center for Sustainable Agriculture, and Center for Health.
• **Named Labs:** Hands-on work at the ARK Foundation Robotics Lab, Dixon Technologies IoT Lab, Anthem Biosciences Lab, Jefferies FinHub, HPC Cluster, Data Analytics Lab, HCI Lab, and Makerspace.
• **Independent Research:** Students can work with professors on independent research outside regular coursework. Research is a core pedagogical element at Plaksha.
• **Plaksha Research Fellowship:** Outstanding graduates and postgraduates can apply for dedicated research fellowships.
• **Capstone Projects:** In Year 4, students complete capstone projects applying their knowledge to real-world challenges, often in collaboration with industry partners.

### Research Internships
• International research internships at partner universities (Cornell, UC Berkeley, Purdue, Penn, etc.)
• Industry research collaborations with companies in the Plaksha network`,
};

async function main() {
  await initAppDatabase();

  const slugs = Object.keys(PATCHES);
  const topics = await getKnowledgeTopicsBySlugs(SITE_ID, slugs);

  for (const topic of topics) {
    const patch = PATCHES[topic.slug];
    if (!patch) continue;

    const newContent = topic.content + patch;
    const tokenEstimate = Math.ceil(newContent.length / 4);

    await upsertKnowledgeTopic({
      siteId: SITE_ID,
      slug: topic.slug,
      name: topic.name,
      description: topic.description,
      content: newContent,
      sourceUrls: topic.sourceUrls || [],
      tokenEstimate,
    });

    console.log(
      `✓ ${topic.slug}: ${topic.content.length} → ${newContent.length} chars (+${patch.length})`
    );
  }

  console.log("\nDone! All topics patched.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
