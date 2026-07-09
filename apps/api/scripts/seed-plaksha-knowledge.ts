/**
 * Seed manually-compiled knowledge files for plaksha.edu.in
 *
 * Usage: npx tsx apps/api/scripts/seed-plaksha-knowledge.ts
 */
import "dotenv/config";
import {
  initAppDatabase,
  upsertKnowledgeTopic,
  upsertKnowledgeIndex,
  upsertGraphEdges,
  type GraphEdge,
} from "../src/services/db";

const SITE_ID = "plaksha.edu.in";

interface TopicDef {
  slug: string;
  name: string;
  description: string;
  content: string;
  sourceUrls: string[];
}

const topics: TopicDef[] = [
  // ─── 1. ABOUT ───
  {
    slug: "about",
    name: "About Plaksha University",
    description:
      "University overview, history, founding story, mission, vision, values, pillars, campus location, and governance model",
    sourceUrls: [
      "https://plaksha.edu.in/about-us",
      "https://plaksha.edu.in/university-leadership",
    ],
    content: `# About Plaksha University

## Overview

Plaksha University was established in 2021 under the Punjab State Private Universities Policy of 2010. The university has over 500 students and 40 faculty members, including academic experts and industry professionals. The 50-acre campus is located in the Chandigarh tri-city area, 10 minutes from the Chandigarh International Airport.

**Campus Address:** Alpha, Sector 101, IT City Rd, Sahibzada Ajit Singh Nagar, Punjab 140306

## Founding Story

Plaksha's journey started in 2015, as a conversation among a few friends about how and why technology education needs to change. The founding group consisted of entrepreneurs and business leaders seeking to transform engineering and technology education in India and globally.

Reimagining Higher Education Foundation, a Section 8 not-for-profit company, was set up in 2017 with a mission of converting the idea into a plan. In February 2019, the campus groundbreaking occurred in Mohali. In August 2021, the campus opened.

More than 100 tech entrepreneurs, business leaders, and academicians across six countries have come together to shape Plaksha's mission.

## Three Pillars of Plaksha

**Pillar 1: Reimagining Technology Education**
Interdisciplinary curriculum integrating technology, social sciences and design. Hands-on pedagogy and focus on self-development.

**Pillar 2: Enabling Research and Innovation Ecosystem**
Entrepreneurial mindset in faculty and students, innovation culture and enabling ecosystem, mentorship and networks.

**Pillar 3: Addressing Grand Challenges**
Thematic research centers with industry, government and academia collaboration; shared core lab infrastructure.

## Key Differentiators

- **Collective Governance:** Plaksha operates under a model of collective governance, drawing on the expertise of a distinguished Academic Advisory Board and a founding community of entrepreneurs, business leaders, and academicians.
- **Global Partnerships:** Collaborations with Cornell University, UC Berkeley, Penn Engineering, Purdue University, and Brigham and Women's Hospital (Harvard) shape globally aligned curricula, pedagogy, and student experiences.
- **Research Culture:** Four interdisciplinary research centers address grand challenges in clean energy, sustainable agriculture, water security, and equitable health.
- **Reimagined Undergraduate Education:** Four BTech majors built on an interdisciplinary foundation. The Freshmore curriculum integrates design, humanities, modern computing, and fundamental sciences — free from traditional department silos.
- **Greenfield Advantage:** As a young institution, Plaksha is free from legacy constraints and able to drive innovation in curriculum, pedagogy, and institutional design.
- **Entrepreneurial Mindset:** The university's agile and action-oriented culture supports bold experimentation and rapid execution.

## Vision 2032-2033

- 3000+ Students on campus
- 250+ Faculty
- 225+ Startups supported
- 8 Research centers

## University Leadership

- **Chancellor:** Dr. Shankar Sastry (Founding Chancellor) — shankar.sastry@plaksha.edu.in
- **Vice Chancellor:** Dr. Rudra Pratap (Founding Vice Chancellor, PhD Cornell University, MEMS Technology) — vc@plaksha.edu.in
- **Chair, Board of Trustees:** Neeraj Aggarwal (Vice Chair - Asia Pacific, Boston Consulting Group) — neeraj.aggarwal@plaksha.edu.in
- **Pro-Vice Chancellor:** Arvind Agrawal — provc@plaksha.edu.in
- **Dean of Academics:** Dr. Srikant Srinivasan — dean.academics@plaksha.edu.in
- **Dean of Research:** Dr. Sunita Chauhan — dean.research@plaksha.edu.in
- **Registrar:** Abhay Sharma — registrar@plaksha.edu.in
- **Senior Advisors:** Dr. M Balakrishnan (Advisor, Faculty Affairs), Dr. Uday Desai (Honorary Distinguished Professor)

## Academic Advisory Board

Plaksha's Academic Advisory Board was formed in 2017, bringing together radical thinkers and academic leaders from across the world. The board comprises 20 eminent scholars and institutional leaders transforming higher education globally.

## Founders

Plaksha's founders are accomplished business leaders and technology entrepreneurs from India and global hubs including Hong Kong, London, New York, Silicon Valley, Singapore, and Tokyo. They support the university through philanthropy, mentoring students, guiding strategic initiatives, and building an innovator community.

## Regulatory Status

Plaksha University operates under the Punjab Private Universities Policy 2010. The institution received UGC notification on September 23, 2021, and holds formal recognition as a private university established through the Plaksha University, Punjab Act, 2021. The university maintains statutory bodies including Board of Management, Governing Body, Academic Council, Board of Studies, and Finance Committee. It complies with UGC regulations including POSH guidelines, ragging prevention norms, and student grievance redressal frameworks.`,
  },

  // ─── 2. ADMISSIONS ───
  {
    slug: "admissions",
    name: "BTech Admissions",
    description:
      "Undergraduate admissions process, eligibility criteria, application rounds, deadlines, interview process, and enrollment dates",
    sourceUrls: ["https://plaksha.edu.in/admissions"],
    content: `# BTech Admissions

## Overview

Plaksha is looking for exceptional, bright, curious students for their BTech program — students who will be the tech leaders of tomorrow. Plaksha also welcomes transfer students.

## Important Dates (2026 Intake)

- **Last date to enroll:** July 30, 2026
- **Move-in dates:** July 31 – Aug 2, 2026
- **Orientation date:** Aug 3, 2026
- **Semester start date:** Aug 4, 2026

## Admissions Philosophy

Plaksha University strives to bring together curious tinkerers and problem-solvers with a natural tendency to ask questions, explore concepts, and an openness to learning, wired with a risk-taking attitude. Plaksha is committed to admitting the brightest minds coming from all walks of life.

A student at Plaksha will be encouraged to wear multiple hats facilitated by the interdisciplinary nature of the curriculum. This warrants an incoming student to demonstrate strong academic rigor along with the ability to communicate their thoughts and ideas effectively. Plaksha believes in going beyond the mark sheet with a holistic selection process.

## Eligibility Criteria

### Category A: Indian Citizens or Non-Resident Indians
- Holding an Indian passport
- Currently enrolled in or successfully completed grade 12 of a 10+2 system
- From recognized National or International board or equivalent
- Adequate proficiency in English

### Category B: Foreign Nationals including OCI/PIO
- Currently enrolled in or successfully completed grade 12
- From board recognized by Association of Indian Universities (AIU)
- Submit 'English as the Medium of Instruction' letter from recently graduated school OR English proficiency test score
- Must be at least 18 years old as of 31 July 2026

### Reservations & Quotas
- Plaksha shall provide full tuition fee concession/freeship to not less than 5% of the total student strength from among candidates belonging to the weaker sections of society.
- 15% of total seats reserved for candidates holding Punjab domicile. Vacant seats offered to non-domicile candidates.
- No special quota for international students.
- Students from Hunar Sikhiya School (HSS) Senior Secondary (10+2) certification eligible for admission to undergraduate program in academic session 2026–27.

## Admission Guidelines

- Applicants can apply only once during the admissions cycle.
- Preferred major specified in the application form is indicative and non-binding.
- Shortlisted candidates participate in a virtual interaction (two parts: personal interview and technical assessment).
- Applicants wanting financial aid must check 'yes' in the financial aid box toward the end of the application.
- All decisions made by the Admissions Committee are final.

### Transfer Admissions
Plaksha welcomes transfer students and values a learning approach that is flexible, interdisciplinary, and future-oriented. Students who began their undergraduation at another recognized institution can join Plaksha without restarting their degree.

## Admission Rounds & Timelines

**Note:** Applicants who need a visa to study at Plaksha are strongly recommended to apply by Round 3.

### Round 1
- Applications open: Nov 12, 2025
- Submission deadline: Dec 20, 2025
- Interview dates: Nov 20, 2025 – Jan 28, 2026
- Decision notification: Jan 12, 2026 | Jan 30, 2026
- Scholarship decision: Feb 23, 2026

### Round 2
- Submission deadline: Feb 15, 2026
- Interview dates: Feb 10 – Mar 28, 2026
- Decision notification: Feb 27, 2026 | Mar 31, 2026
- Scholarship decision: Mar 26, 2026

### Round 3
- Submission deadline: Mar 21, 2026
- Interview dates: Mar 18 – Apr 25, 2026
- Decision notification: Apr 28, 2026
- Scholarship decision: May 30, 2026

### Round 4
- Submission deadline: Apr 30, 2026
- Interview dates: Apr 28 – May 23, 2026
- Decision notification: May 27, 2026 | June 9, 2026
- Scholarship decision: July 15, 2026

### Round 5
- Submission deadline: June 7, 2026
- Interview dates: May 25 – June 30, 2026
- Decision notification: June 20, 2026 | July 8, 2026

## Contact

- **Phone:** +91 6392878527 | +91 9875990813
- **Email:** apply@plaksha.edu.in
- **Application Portal:** btech-admissions.plaksha.edu.in`,
  },

  // ─── 3. FEES & FINANCIAL AID ───
  {
    slug: "fees-financial-aid",
    name: "Fees, Scholarships & Financial Aid",
    description:
      "Tuition fee structure, hostel fees, meal plans, merit scholarships, need-based financial aid, Bharti Scholarship, education loans, refund policy",
    sourceUrls: [
      "https://plaksha.edu.in/admissions",
      "https://plaksha.edu.in/financial-aid",
      "https://plaksha.edu.in/bharti-scholarship",
    ],
    content: `# Fees, Scholarships & Financial Aid

## Fee Philosophy

Fee for the BTech program is a range and not a fixed amount. It varies depending on the financial aid awarded. Almost 67% of the students are on some form of scholarship or financial aid. Plaksha's generous financial aid program makes quality education accessible and affordable for all, ensuring that no talented individual is left behind.

The annual fee is subject to revision in consonance with inflation. The revision would be in the range of 5% to 8% annually.

The fee is collected in two instalments every year, at the beginning of each semester.

**Note:** The stated fee is applicable for a nine month duration within the academic year covering the monsoon and spring semesters, but excluding the summer and winter term.

## BTech Fee Structure (Aug 2026 Intake, First Year)

### Category A Students (Indian Citizens / NRIs)

| Fee Item | Amount (INR) |
|----------|-------------|
| Tuition fee | 8,40,000 |
| Hostel fee | 1,55,000 |
| Meal plan | 72,000 |
| Admission fee (one-time) | 55,000 |
| Security deposit (one-time, refundable) | 50,000 |

### Category B Students (Foreign Nationals / OCI / PIO)

| Fee Item | Amount (INR) |
|----------|-------------|
| Tuition fee | 8,40,000 |
| Hostel fee | 1,55,000 |
| Meal plan | 72,000 |
| Supplementary fee | 1,50,000 |
| Admission fee (one-time) | 55,000 |
| Security deposit (one-time, refundable) | 50,000 |

The supplementary fee covers additional academic and administrative support provided to international students.

### Winter/Summer Term
If required to stay on campus during the winter term/summer term, special permissions must be sought and an additional fee will apply.

## Refund Policy (per UGC Fee Refund Policy, June 12, 2024)

| Period of Withdrawal | Acceptance & Tuition Fees | Hostel & Meal Charges |
|---------------------|---------------------------|----------------------|
| Up to Sep 30, 2026 | 100% refund | Pro-rata basis |
| Oct 1 – Oct 31, 2026 | 100% refund after ₹1,000 processing deduction | Pro-rata basis |
| On or after Nov 1, 2026 | No refund | No refund |

The acceptance fee includes the admission fee and security deposit. The security deposit is refundable subject to clearance of dues and damages.

## Financial Aid (Need-Based)

### Key Statistics (as of Sep 30, 2025)
- **INR 53 crore** total distributed in merit scholarships and financial aid
- **69%** of students supported by merit scholarship or financial aid
- **33.7%** of students on full tuition waiver

### Need-Based Aid Details
- **Amount distributed:** INR 44.92 crore
- **Coverage:** 46.3% of students
- **Full waiver recipients:** 26% of students

### Eligibility
- Only admitted students can apply
- For salaried families: gross annual income (including salary and income from other sources) must be below INR 50 lakh
- Factors considered: family income, savings, assets, essential expenses

### Aid Slabs
- **0–12 lakh income:** INR 0–2.1 lakh tuition fee payable
- **12–50 lakh income:** INR 2.1–6.3 lakh tuition fee payable
- **Range:** 25% to 100% of tuition and living expenses

### Aid Application Process
- Only applicants shortlisted for admission interviews receive financial aid application invitations
- Holistic review considers academics, extracurricular involvement, and co-curricular contributions when demand exceeds available funds

## Merit Scholarship

- **Eligibility:** Students scoring 95–100% in board exams and 95th–100th percentile in JEE
- **Award Range:** 25% to 100% tuition waiver
- **Application:** Automatic consideration for first year; no separate application required

### Renewal Requirements
- Maintain high academic standing (typically top 5–10% CGPA)
- No course backlogs
- Minimum CGPA: typically 6.5/10
- Follow Student Code of Conduct
- High class attendance
- Volunteer for campus activities
- Participate in community service

## Bharti Scholarship

The Bharti Airtel Foundation established this prestigious scholarship for exceptional students from diverse socio-economic backgrounds.

- **Number of scholars:** Up to 20 students
- **Coverage:** Full scholarship including tuition and living expenses
- **Benefits:** Student mentoring program by senior faculty and industry leaders; participation in exchange programs with global universities
- **Eligibility:** Full-time undergraduate students at Plaksha who demonstrate financial need
- **Duration:** Renewable for up to four years upon maintaining minimum CGPA

### Bharti Scholar Attributes
- Motivation to benefit society
- Out of the box thinking, bias for action and entrepreneurial mindset
- Leadership and ethics
- Grit and determination

### Selection Process
1. Statement of Purpose / Personal Essays evaluation
2. Initial shortlisting based on financial need and holistic evaluation
3. Scholarship Committee Interview for final selection

### Student Obligations
- Maintain minimum CGPA for annual renewal
- Participate in projects, internships and capstones with emphasis on social impact

## Other Named Scholarships
- **Axis Bank Scholarship**
- **Ayyalasomayajula Lalitha Scholarship Fund** (for women postgraduate students)

## Education Loan Partners

1. **Propelld** — Principal moratorium, competitive ROI, step-up EMIs
2. **Axis Bank** — No prepayment charges, collateral-free options, tax benefits
3. **Credila** — Up to 100% coverage, flexible repayment, no margin money
4. **ICICI Bank** — INR 1 lakh to INR 3 crore, unsecured up to INR 1 crore
5. **Avanse Financial Services** — 10.5% interest from, 15-year tenure

## Contact
financialaid.ug@plaksha.edu.in`,
  },

  // ─── 4. UNDERGRADUATE PROGRAMS ───
  {
    slug: "undergraduate-programs",
    name: "Undergraduate Programs (BTech)",
    description:
      "Overview of all four BTech degrees, Freshmore curriculum structure, 4-year program design, interdisciplinary approach, minor in tech entrepreneurship",
    sourceUrls: [
      "https://plaksha.edu.in/ug",
      "https://plaksha.edu.in/ug/btech-degree/computer-science-and-artificial-intelligence",
      "https://plaksha.edu.in/ug/btech-degree/data-science-business-economics",
      "https://plaksha.edu.in/ug/btech-degree/biological-systems-engineering",
    ],
    content: `# Undergraduate Programs (BTech)

## Overview

Plaksha offers four interdisciplinary BTech degrees designed to create ethical leaders who will leverage technology and social sciences to impact organisations and society. The program is a 4-year undergraduate degree.

## Four BTech Degrees

1. **BTech in Computer Science & Artificial Intelligence**
2. **BTech in Robotics & Autonomous Systems**
3. **BTech in Biological Systems Engineering**
4. **BTech in Data Science, Economics & Business**

## Curriculum Structure (4 Years)

### Year 1 — Freshmore: Unlearn, Learn, Relearn
Foundation building in technical, social, and humanistic understanding with core interdisciplinary courses. All students share the same Freshmore curriculum regardless of their chosen major.

**Core Freshman Courses include:**
- Computing & Data Science: Computational Thinking, Programming and Data Structures, Coding Café, Introduction to Data Science
- Mathematics: Engineering Math in Action (linear algebra, differential equations), Mathematics of Uncertainty (probability & statistics), Calculus in Higher Dimensions, Computational Methods and Optimization
- Sciences: Foundations of Physical World, Nature's Machines, Engines of Life
- Humanities & Social: The Art of Thinking and Reasoning, Reimagining Technology and Society, Ethics of Technological Innovation, Entangled World: Technology and Anthropocene
- Innovation: Design and Innovation, Innovation Lab and Grand Challenge Studio (linked to sustainable development goals)
- Indian Knowledge System integration
- Fundamentals of Microeconomics

### Year 2 — Choose Your Path
Students select a major and identify real-world problem areas of interest.

### Year 3 — Building Depth
Deep expertise development combining technology, sciences, and liberal arts.

### Year 4 — Applying Knowledge
Real-world project work in interdisciplinary teams at companies, nonprofits, or startups.

## Additional Programs
- **Minor in Tech Entrepreneurship:** An interdisciplinary undergraduate program combining academic rigor with hands-on venture development. Open to all majors.
- **Grand Challenge Scholars Program**

---

## BTech in Computer Science & Artificial Intelligence

A 4-year program combining computer science fundamentals with AI, ML, and human-computer interaction. Computing systems will be pervasive and the interface of human and artificial intelligence will be a source of future grand challenges.

### Program Core Courses (Mandatory)
- Introduction to Data Mining
- Machine Learning and Pattern Recognition
- Design and Analysis of Algorithms
- Deep Learning
- Theory of Computation
- Foundations of Computer Systems
- Knowledge Representation and Reasoning
- Reinforcement Learning Fundamentals

### Elective Options (19 courses)
Advanced Statistics, Cryptography and Blockchain, Game Theory, Networks, Human-Tech Interaction, Drones and Precision Agriculture, and specialized AI/ML courses.

### Career Applications
Recognition systems (facial recognition, voice, biometrics), personalized learning platforms with AI tutors, healthcare AI for disease diagnosis, AI-driven content discovery and creative tools.

---

## BTech in Data Science, Economics & Business

A 4-year interdisciplinary degree combining data science fundamentals with economics, behavioral studies, and business applications.

### Data Science Core Courses
- Introduction to Data Mining (SQL, NoSQL, data visualization)
- Machine Learning and Pattern Recognition
- Design and Analysis of Algorithms
- Deep Learning (neural networks, NLP, computer vision)

### Economics Core Courses
- Macroeconomics
- Econometrics
- Advanced Statistics
- Finance (corporate finance and accounting)
- Game Theory
- Industrial Organization
- Advanced Microeconomics

### Economics Electives
Indian Economy and Financial Systems, Behavioral Economics, Environmental Economics, Microeconomics of Development, Time Series Analysis, Financial Econometrics, Personnel Economics, Gender in Economics and Business, Macro Development

### ML & AI Electives
Reinforcement Learning, Machine Learning in Dynamic Environments (recommender systems), Applied Econometrics, Geospatial Data Science, Experimental Economics

### Career Pathways
Data science & analytics, financial analysis & risk management, economic research & policy analysis, business strategy & consulting, technology & fintech, development economics & impact assessment.

---

## BTech in Biological Systems Engineering

A 4-year degree blending biology with technology. Students explore cellular mechanisms and cutting-edge techniques including CRISPR, biosensors, biomaterials, and bioinformatics.

### Program Core Courses
- Material Science for Bioengineering
- Biochemistry and Molecular Biology (with lab)
- Cell Biology (with molecular cloning)
- Genetics and Genetic Engineering (including CRISPR Cas system)
- Bioprocess Engineering (bioreactor design)
- Bioinformatics and Computational Biology

### Elective Options
Deep Learning, Advanced Statistics, Neuroscience, Quantum Computing, Diagnostic Technologies, Nucleic Acids and Protein Biosensors, Health Economics

### Career Applications
Disease modeling & pandemic forecasting, wearable prosthetic development, environmental monitoring systems, biomedical device design, pharmaceutical research.

---

## BTech in Robotics & Autonomous Systems

Combines AI, computer science, electronics, and mechanical engineering for mobility, automation, and sustainability applications.

## Key Learning Outcomes (All Programs)

- Multidisciplinary approach drawing from math, physics, engineering, and humanities
- Foundational tech core integrating theoretical and applied knowledge
- Innovation mindset with entrepreneurship focus
- Societal responsibility and ethical technology development
- Leadership capabilities emphasizing communication and collaboration`,
  },

  // ─── 5. GRADUATE PROGRAMS ───
  {
    slug: "graduate-programs",
    name: "Graduate & Postgraduate Programs",
    description:
      "PhD program, MS in AI, Tech Leaders Fellowship, Plaksha Research Fellowship — eligibility, stipends, research areas, admission process",
    sourceUrls: [
      "https://plaksha.edu.in/phd",
      "https://plaksha.edu.in/pg/tech-leaders-fellowship",
      "https://plaksha.edu.in/plaksha-research-fellowship",
      "https://plaksha.edu.in/pg/ms-in-ai",
    ],
    content: `# Graduate & Postgraduate Programs

## PhD Program

### Overview
Plaksha's PhD program emphasizes interdisciplinary research to address grand challenges with state-of-the-art facilities across four dedicated research centers focusing on clean energy, water security, health, and sustainable agriculture. Currently, over 30 PhD scholars pursue research under faculty trained from premier institutions globally.

### Eligibility
- 1-year/2-semester master's degree with ≥55% aggregate after 4-year bachelor's
- 2-year/4-semester master's degree with ≥55% aggregate after 3-year bachelor's
- 4-year/8-semester bachelor's with ≥75% aggregate
- MPhil degree with ≥55% aggregate
- Equivalent foreign qualifications accredited by recognized assessment agencies

### Open Research Areas (2026)
- Computer Networks & Intelligent Transportation Systems
- Artificial Intelligence (Computer Vision, Graph Neural Networks, Agentic AI)
- AI & Robotics
- Electrical Engineering (Sensors, Electromagnetism)
- Economics (Applied Econometrics, Gender Economics, Health Economics)
- Game Theory & Large Language Models
- Materials Engineering & Nanotechnology
- Social Computing & NLP
- Reinforcement Learning & Computer Vision
- Mechanical Engineering (Fluid Mechanics, Heat Transfer)
- Human-AI Interaction
- Cryptography
- Environmental Economics

### Financial Support

**Standard Stipends:**
- ₹48,000/month for MTech graduates
- ₹42,000/month (Year 1) for BTech/MSc holders; ₹48,000/month (subsequent years)

**Additional Benefits:**
- Professional development allowance: ₹2 lakh
- Nominal fees with 95% tuition waiver (with 10 hrs/week teaching assistance)
- Paid teaching/research assistance opportunities
- Up to 6 months of international fellowship at reputed institutions with airfare and stipend support

**Harish & Bina Shah School Fellowships (Special):**
Eight positions offering exceptional packages: ₹80,000/month rising to ₹1,00,000 by year 5.

### Admission Process
Preference granted to candidates with: CSIR NET-JRF, DBT-JRF, UGC NET-JRF, GATE, IIT-JAM, or GRE qualifications — these candidates bypass written tests and proceed directly to interviews. Other shortlisted candidates face written exams based on NET/GATE syllabus of the concerned discipline.

### Important Dates (2026)

**Monsoon Semester:**
- Applications open: March 1, 2026
- Deadline: April 30, 2026
- Shortlisting: April 16–30
- Written test / Interview: May 1–15
- Offers: May 16–31

**Spring Semester:**
- Applications open: September 1, 2026
- Deadline: October 15, 2026
- Shortlisting: October 16–31
- Written test / Interview: November 1–15
- Offers: November 16–30

**Contact:** phd.academics@plaksha.edu.in

---

## Tech Leaders Fellowship (TLF)

A one-year full-time residential postgraduate program, co-created in partnership with UC Berkeley, designed to nurture innovators, entrepreneurs, and technologists who can harness data-driven tools and technologies to address global challenges.

### Curriculum
- Foundation courses: Math, Programming, Statistics, and Data Science
- Advanced topics: Machine Learning, System Design, Computer Vision, Natural Language Processing
- Soft skills: Leadership, entrepreneurship, problem-solving, and teamwork
- Integrated curriculum blending fundamental AI-ML and Data Science with real-world applications

### Faculty
Over 15 faculty from top global institutions teach in the program. Dr. Ikhlaq Sidhu (Chief Scientist SCET, UC Berkeley) co-chairs the fellowship.

### Current Status
**TLF is on hiatus.** It will be relaunched as a Master's program (MS in AI).

---

## MS in AI

A full-time residential Master's program (relaunch of TLF). Details to be announced.

---

## Plaksha Research Fellowship

### Overview
Targets brilliant graduates and postgraduates in engineering, applied sciences, and social sciences pursuing research careers.

### Eligibility
- Bachelor's or Master's degree in: computer science/engineering, electrical and electronics engineering, mechanical engineering, bioengineering, mathematics, physics, biology, natural sciences, engineering education, humanities/liberal arts, or related areas
- Research interests aligned with: machine learning, AI, data science, robotics, cyber-physical systems, sensors, IoT, biological systems, bioinformatics, engineering ethics, humanities
- Must be below 30 years of age

### Compensation
- **Base stipend:** Minimum INR 50,000/month consolidated (includes HRA), higher for exceptional candidates
- **Conference allowance:** Up to INR 50,000 annually
- **Medical insurance:** INR 5 lakh coverage
- **Housing:** On-campus hostel available on payment basis

### Duration
Initial one-year contract. Renewable annually up to three years maximum.

### Responsibilities
- Conduct research with partner institution collaboration
- Author research and conference papers with faculty guidance
- Support undergraduate teaching (minimum one course per semester, ~10–12 hours weekly)

### Career Benefits
- PhD program priority consideration at Plaksha
- Priority for full-time research engineer roles
- Mentorship for future academia/industry careers`,
  },

  // ─── 6. FACULTY ───
  {
    slug: "faculty",
    name: "Faculty",
    description:
      "Full-time faculty profiles, research areas, departments, visiting and adjunct faculty, recruitment",
    sourceUrls: [
      "https://plaksha.edu.in/faculty",
      "https://plaksha.edu.in/about-us",
    ],
    content: `# Faculty

## Overview

Faculty come from leading institutions in India and abroad, including MIT, Cornell, University of California Berkeley, Purdue University, London School of Economics, Imperial College London, University of Cambridge, IITs and IISc among others.

## Full-Time Faculty Members

1. **Abhishek Dureja** — Assistant Professor | PhD (IGIDR, Mumbai) | Applied Econometrics
2. **Alok Ranjan** — Assistant Professor | PhD (University of Illinois Urbana-Champaign) | Economics and Data Science
3. **Amit Sheth** — Professor | MPhil (IIT Bombay) | Universal Design
4. **Amruta R Behera** — Assistant Professor | PhD (IISc Bengaluru) | MEMS Technology, IoT
5. **Ankur Nahar** — Assistant Professor | PhD (IIT Jodhpur) | Computer Networks
6. **Anupam Sobti** — Assistant Professor | PhD (IIT Delhi) | Applied Machine Learning
7. **Arshdeep Sidhu** — Assistant Professor | PhD (University of Twente) | Protein Biochemistry
8. **Brainerd Prince** — Associate Professor | PhD (Middlesex University) | Philosophy of Language
9. **Chaitanya Lekshmi Indira** — Associate Professor | PhD (IISc Bengaluru) | Materials Science
10. **Deepak Khemani** — Professor | PhD (IIT Bombay) | Artificial Intelligence
11. **Deepan Muthirayan** — Assistant Professor | PhD (UC Berkeley) | Computer Science, AI
12. **Dhiraj Sinha** — Assistant Professor | PhD (University of Cambridge) | Sensors Technology
13. **Jenny Tilsen** — Assistant Professor | PhD (University of Minnesota) | Science and Technology Studies
14. **Malini Balakrishnan** — Professor | PhD (IIT Delhi) | Resource Efficiency
15. **Mayank Ratan Bhardwaj** — Assistant Professor | PhD (IISc) | AI for Social Good
16. **Monika Sharma** — Associate Professor | PhD (IIIT Hyderabad) | Bioinformatics
17. **Navjot Kaur** — Assistant Professor | PhD (IISc Bengaluru) | Point-of-care Diagnostics
18. **Pankaj Pansari** — Assistant Professor | PhD (University of Oxford) | Machine Learning
19. **Prakarsh Singh** — Chair Professor | PhD (London School of Economics) | Economics
20. **Prashanth Suresh Kumar** — Assistant Professor | PhD (Delft University of Technology) | Water Technology
21. **Praveen Kumar** — Associate Professor | PhD (IIT Delhi) | Quantum Materials and Devices
22. **Rajesh Sharma** — Professor | PhD (Nanyang Technological University) | Social Computing
23. **Rucha Joshi** — Associate Professor | PhD (Purdue University) | Engineering Education
24. **Rudra Pratap** — Founding Vice Chancellor | PhD (Cornell University) | MEMS Technology

*(Additional faculty on page 2 of the faculty directory)*

## Faculty Categories
- Full Time Faculty
- Visiting Faculty
- Guest Faculty
- Adjunct Faculty

## Faculty Recruitment
Open positions for faculty are available. Apply through Interfolio.
Contact: academic.relations@plaksha.edu.in | +91 172 412 6401`,
  },

  // ─── 7. PLACEMENTS & CAREERS ───
  {
    slug: "placements-careers",
    name: "Placements & Career Outcomes",
    description:
      "Placement statistics, average CTC, recruiting companies, internship timelines, career development office",
    sourceUrls: [
      "https://plaksha.edu.in/corporate-partnerships-careers",
    ],
    content: `# Placements & Career Outcomes

## Placement Statistics (2025)

- **55** recruiting companies
- **80** roles offered
- **100%** placement rate for eligible students
- **INR 20 LPA** average CTC (Cost to Company)

## Internship Timelines

### Summer Internships
- Application process: September 2026 to April 2027
- Duration: June to July 2027

### Semester Internships
- Application process: August to December 2026
- Duration: January to June 2027

## BTech Placements Timeline
- Application process: August 2026 to May 2027
- Expected joining date: July 2027

## Recruiting Partners

### Consulting & Strategy
Boston Consulting Group, McKinsey & Company, ICF

### Tech & Product
Flipkart, Wayfair, Whatfix, Quizizz, Sarvam AI, August AI, Decision Tree

### Finance & Analytics
Arcesium, DE Shaw, Jefferies, JM Financial, Capital2B, Clix Capital, Meru Capitals

### Startups & Emerging Tech
LAT Aerospace, Pixxel, Predli

### Other Sectors
Aditya Birla, Policy Bazaar, Bizom, Eggoz, Growth Natives, Nagarro, Global Data, Educational Initiatives, Aakash, Sunteck Realty

## Notable Student Outcomes
Recent placements include positions at McKinsey & Company, LAT Aerospace, Arcesium India, and Flipkart. Students have also pursued higher studies at Carnegie Mellon University (MS in AI).

## Contact
career.development@plaksha.edu.in`,
  },

  // ─── 8. RESEARCH CENTERS ───
  {
    slug: "research",
    name: "Research Centers & Labs",
    description:
      "Indorama Ventures Center for Clean Energy, Center for Water Security, research areas, faculty, facilities, Binny Bansal Institute, ARK Robotics Lab",
    sourceUrls: [
      "https://plaksha.edu.in/center-for-clean-energy",
      "https://plaksha.edu.in/center-for-water-security",
      "https://plaksha.edu.in/axis-bank-futuretech-building",
    ],
    content: `# Research Centers & Labs

## Overview

Plaksha has four interdisciplinary research centers addressing grand challenges in clean energy, sustainable agriculture, water security, and equitable health. Research is conducted in state-of-the-art facilities.

---

## Indorama Ventures Center for Clean Energy

### Mission
To lead clean energy transition through education and research, operating at the intersection of energy and digitalization to enable scalable, sustainable and affordable deployment of energy solutions.

### Vision
A future where India's energy sector is characterized by decarbonization, self-reliance, and grid security, enabling universal access to clean and secure energy.

### Research Focus Areas

**1. Informing and Evaluating Policy**
Developing action plans with government stakeholders and contributing to building codes (ECBC, Eco Niwas Samhita, Green Building Code).

**2. Urban Climate Technology**
Building models, simulations, and city-scale prototypes for understanding climate impact.

**3. Building Design & Operations**
Tools and optimizations for cost-effective, operationally efficient buildings.

### Key Research Initiatives

**Building Energy Efficiency:**
- Neighborhood planning and distributed generation
- Building envelope optimization, smart devices, renewable integration
- Non-intrusive load monitoring and energy storage systems

**Urban Heat Island Mitigation:**
- District-level simulations to assess UHI impact
- Microclimate laboratory studies
- Solutions: cool roofs, passive design, vertical gardening

### Faculty Team
- Dr. Anupam Sobti (Applied Machine Learning, Embedded Systems)
- Dr. Shashikant Pawar (Fluid Dynamics, Heat Transfer)
- Dr. Vivek Deulkar (Sustainable Carbon Efficient Energy Systems)
- Prof. Vishal Garg (Energy Efficient Smart Buildings)

**Contact:** manager.cleanenergy@plaksha.edu.in

---

## Center for Water Security

### Mission
To ensure sustainable access to clean water for all social, economic and environmental activities in India for the next 50 years.

### Research Areas

**Autonomous Robots for Aquatic Monitoring**
Robotic systems adapting to various environments, enabling monitoring and modeling of aquatic ecosystem health and disaster response.

**Optical Sensors for Heavy Metal Detection**
Handheld optical sensors to identify chromium, arsenic, and uranium in waterbodies, targeting WHO compliance standards of under 0.1 ppm.

**AI Models for Sewage Treatment Optimization**
AI systems to enhance Sewage Treatment Plant operations by optimizing complex contaminant removal processes.

**Energy-Efficient Industrial Wastewater Treatment**
Forward Osmosis membrane technology as an alternative to high-energy methods, supporting India's Zero Liquid Discharge policy.

### Campus Initiative — Net Zero Water
Plaksha operates an IoT-enabled water monitoring dashboard tracking consumption, domestic water quality, and treated water parameters across campus buildings.

### Collaborations
- IIT Madras — advancing clean water solutions
- ATE Enterprise — industrial wastewater treatment and recycling
- DigitalPaani — IoT and sensor optimization for wastewater treatment

### Faculty
- Dr. Malini Balakrishnan (Wastewater, Resource Efficiency)
- Dr. Prashanth Suresh Kumar (Water Technology)
- Dr. Chaitanya Lekshmi Indira (Functional Nanomaterials)
- Dr. Sandeep Manjanna (Robotics, Applied Machine Learning)

---

## Binny Bansal Institute for Inventing the Future

Located in the Axis Bank FutureTech Building. Focuses on research, innovation, capability-building and collaboration in solving grand challenges in future tech.

---

## Axis Bank FutureTech Building

A state-of-the-art innovation hub spanning 104,000 square feet across four floors.

**Key Facilities:**
- High-Performance Computing Cluster
- Data Analytics Lab
- Human-Technology Interaction Lab
- Product Prototyping Studio
- Harish and Bina Shah School of AI & Computer Science
- Advanced instructional facilities and laboratories

**Axis Bank Initiatives:**
- Doctoral student funding for future tech research
- Faculty chair for academic excellence
- Hosting specialized educational events (masterclasses)

---

## ARK Foundation Robotics Lab

Research lab for robotics and autonomous systems.

---

## Office of Research

Supports patent and tech transfer, startup registration, and research funding applications.`,
  },

  // ─── 9. CAMPUS & STUDENT LIFE ───
  {
    slug: "campus-life",
    name: "Campus & Student Life",
    description:
      "Campus facilities, well-being services, counseling, hostel, student activities, clubs, DS Brar Center for Women in STEM",
    sourceUrls: [
      "https://plaksha.edu.in/well-being",
      "https://plaksha.edu.in/ds-brar-center",
      "https://plaksha.edu.in/axis-bank-futuretech-building",
    ],
    content: `# Campus & Student Life

## Campus Overview

Plaksha's 50-acre campus is located in the Chandigarh tri-city area, 10 minutes from the Chandigarh International Airport.

**Address:** Alpha, Sector 101, IT City Rd, Sahibzada Ajit Singh Nagar, Punjab 140306

### Key Facilities
- Axis Bank FutureTech Building (104,000 sq ft, 4 floors)
- High-Performance Computing Cluster
- Data Analytics Lab
- Human-Technology Interaction Lab
- Product Prototyping Studio / Makerspace
- ARK Foundation Robotics Lab
- Hostel accommodation
- Library
- Virtual Campus Tour available at iviewd.com/plakshauni2

---

## Student Well-Being

Plaksha approaches wellbeing as a dynamic and ongoing journey that evolves with student needs. The university implements a two-pronged model: preventive skill-building combined with corrective support to help students manage academic pressure, regulate emotions, and develop resilience.

**Campus motto:** "At Plaksha, let's normalise mental health as health."

### Counseling Services
The wellbeing team operates seven days weekly on campus:
- **Dr. Shalini Sharma** — Monday, Tuesday, Thursday, Friday | Specializes in Emotional Intelligence, Internal Family Systems, Rational Emotive Behaviour Therapy
- **Dr. Pamil Preet** — Wednesday, Thursday, Friday, Saturday, Sunday

Appointments booked through detalks.com.

### Well-Being Programs
- **Wellbeing Boot Camp:** Interactive event with reflective activities including wellbeing darts, fort building, and appreciation cards
- **Procrastination Skill Building:** Workshops to identify patterns and implement strategies to overcome overwhelm

---

## DS Brar Center for Girls and Women in STEM

Backed by Mphasis, this center operates with a mission to create an inclusive and thriving ecosystem that facilitates advancement of girls and women in STEM.

### Core Initiatives
- Bridge the STEM gender gap through support networks of role models
- Develop the next generation of change-makers in STEM careers
- Increase women's enrollment in STEM fields

### Programs
- **She Innovates Fellowship**
- **Inspiring Speakers** — industry leaders share success stories
- **Impactful Solutions** — global community exchanges
- **Engaging Dialogues** — collaborative forums on research, education, and innovation

### Mentors
Rekha Menon (Former Chairperson, Accenture), Aparna Gupta (Microsoft), Geeta Mathur (Hero Housing Finance), Dhavala Suri (IISc), and others.

### Partners
Mphasis, Beyond, Infoedge, Her Second Innings, Pink Lemonade, Encubay

---

## Student Life Contacts
- **Student Life Office:** +91 98759 90805 | studentlife@plaksha.edu.in
- **Associate Director (Student Life):** Karan Singh — +91 70872 22381
- **Warden (Boys):** Shashi Kant Dwivedi — +91 70870 22281
- **Warden (Girls):** Pooja Shradha — +91 70870 22282`,
  },

  // ─── 10. PARTNERSHIPS & GLOBAL ───
  {
    slug: "partnerships-global",
    name: "Partnerships & Global Engagements",
    description:
      "International partnerships, exchange programs, semester abroad, 4+1 master's pathways, partner universities, visiting student program",
    sourceUrls: [
      "https://plaksha.edu.in/partnerships",
      "https://plaksha.edu.in/office-of-global-engagements",
    ],
    content: `# Partnerships & Global Engagements

## Overview

Top global institutions are closely involved in curriculum design, delivery, faculty and student exchange and joint research.

## International Partner Universities

### US Institutions
- **University of Pennsylvania (UPenn)** — Engineering & Applied Sciences
- **Purdue University** — Elmore School of Electrical and Computer Engineering
- **University of Wisconsin Madison** — College of Agricultural & Life Sciences
- **Johns Hopkins University** — Carey Business School
- **UC San Diego**
- **University of Maryland, Baltimore**
- **Cornell University**
- **USC Viterbi School of Engineering**
- **Illinois Institute of Technology**
- **Rutgers University**
- **Brigham and Women's Hospital**
- **UC Berkeley**

### European Partners
- **University of Cambridge**
- **Barcelona School of Economics**
- **Università Campus Bio-Medico di Roma**

### Indian Partners
- IIT Bombay, IIT Kanpur, IIT Madras
- IIIT Hyderabad
- IISER Mohali
- Indian Institute of Science (IISc)
- PGIMER

## Key Partnership Details

### UC Berkeley
Joint research projects, academic programs, exchange of faculty, students, and postdocs. Dr. Ikhlaq Sidhu (Chief Scientist SCET, UC Berkeley) co-chairs the Tech Leaders Fellowship.

### Purdue University
Master Alliance Agreement covering curricular development, faculty and student exchange, and joint research. Dr. Arvind Raman (Sr. Associate Dean, College of Engineering) collaborated on undergraduate majors. Faculty taught design thinking and engineering ethics modules.

### IISc Bengaluru
Faculty and student mobility, curriculum co-development, joint research in robotics, cyber-physical systems, digital health, and sensor technology.

## Student Opportunities

### Summer Abroad Programs
Coursework at partner universities with global exposure.

### Semester Abroad Programs
Study at international partners with course transfer eligibility toward Plaksha degree.

### Research Internships Abroad
Hands-on experience in academic and professional settings at partner institutions.

### Masters' Progression Pathways (4+1 Programs)
Complete bachelor's and master's degrees in five years with:
- University of Pennsylvania
- Purdue University
- University of Wisconsin Madison
- Johns Hopkins University

### Visiting Student Program
International undergraduate students can spend a semester or up to one academic year at the Plaksha campus.

## Faculty Testimonials

**Prof Andy Ruina (Cornell University):** "It is a pleasure to watch Plaksha find its unique path towards the end of being uniquely good at giving practical engineering education."

**Prof Rajeev Barua (University of Maryland):** "The best of the students are equal to the best I have ever met. The high expectations of the University from students, the world-class facilities and faculty...sets it apart."

**Prof Jack Copeland (University of Canterbury, New Zealand):** "The transdisciplinary research and teaching environment is exciting. Plaksha students are terrific — brainy, eager to learn."

## OGE Team
- Dr. B L Ramakrishna — Advisor
- Dr. Srikant Srinivasan — Dean of Academics
- Harshita Tripathi — Associate Director | +91 172 497 6871 | head.global@plaksha.edu.in
- Rupsy Grewal — Manager | global.engagements@plaksha.edu.in`,
  },

  // ─── 11. ENTREPRENEURSHIP ───
  {
    slug: "entrepreneurship",
    name: "Entrepreneurship & Incubation",
    description:
      "Info Edge Center for Entrepreneurship, Plaksha Incubation Centre, Minor in Tech Entrepreneurship, startup support, Alchemy pitch event",
    sourceUrls: [
      "https://plaksha.edu.in/center-for-entrepreneurship",
    ],
    content: `# Entrepreneurship & Incubation

## Info Edge Center for Entrepreneurship

Aims to nurture a culture of innovation and creativity among students through mentorship from prominent business leaders. The collaboration between Plaksha University and Info Edge seeks to empower students to create impact.

## Plaksha Incubation Centre (PIC)

Supports entrepreneurial ventures through:
- Mentoring and connections with Plaksha founders and industry leaders
- Founder-friendly academic pathways (gap semesters, placement holidays)
- Lab access, makerspace, and prototyping support
- Startup registration assistance and incubation space
- Funding via Alchemy (annual pitching event) and government programs
- Patent and tech transfer support through the Office of Research

## Minor in Tech Entrepreneurship

An interdisciplinary undergraduate program combining academic rigor with hands-on venture development. Open to all majors, it emphasizes experiential learning and cross-disciplinary collaboration.

## Mentor Network

### Plaksha Mentors
- Alok Mittal (Indifi Technologies)
- Hitesh Oberoi (Info Edge CEO)
- Rudra Pratap (Founding VC)
- Arvind Agrawal

### Industry Mentors
Representatives from The Foundery, FieldAssist, Innovation Mission Punjab, and IISER Mohali.`,
  },

  // ─── 12. SUMMER PROGRAMS ───
  {
    slug: "summer-programs",
    name: "Summer Programs for High School Students",
    description:
      "YTS+ (Young Technology Scholars) program for classes 9-12, tracks, fees, dates, eligibility",
    sourceUrls: [
      "https://plaksha.edu.in/hs/young-technology-scholars",
    ],
    content: `# Summer Programs for High School Students

## YTS+ (Young Technology Scholars)

### Overview
A two-week residential summer program for students of Classes 9–12 (all streams) at Plaksha University campus.

### Program Dates (2026)
**Duration:** May 24 – June 7, 2026 (two weeks)

### Application Timeline
- Jan 29, 2026: Applications open
- Feb 22, 2026: Round 1 deadline
- Mar 29, 2026: Round 2 deadline
- Apr 19, 2026: Round 3 deadline

### Fee
- **Program cost:** ₹1,05,000 + GST (as of Jan 29)
- **Discounted fee:** ₹90,000 (after Jan 31)
- No application fee

### Three Learning Tracks

**1. Biology Beyond Medicine**
"Solutions inspired by life itself" — hands-on experiments exploring biological systems for healthcare, environment, sanitation, and biotechnology challenges.

**2. Data Science, Economics and Business**
"Using numbers to shape choices" — data-driven insights for economic and business problem-solving.

**3. Robotics in Action**
"Machines that think and act" — building robots using electronics and systems thinking for mobility, automation, and sustainability.

### Program Structure (Three Phases)

**Phase 1:** Exploratory phase introducing all tracks, real-world problems, and first principles thinking.

**Phase 2:** Advance to chosen learning track; one week of project execution with faculty guidance.

**Phase 3:** Demo day featuring project exhibitions and presentations.

### Selection Process
1. Application form submission
2. Application screening (mindset and alignment evaluation)
3. Optional online interview
4. Holistic admission decision

### Contact
**Phone:** +91 73035 80960
**Email:** youngtechscholars@plaksha.edu.in`,
  },

  // ─── 13. CAREERS AT PLAKSHA ───
  {
    slug: "work-at-plaksha",
    name: "Careers at Plaksha",
    description:
      "Job opportunities at Plaksha, faculty and non-faculty roles, application process, CREATE values",
    sourceUrls: [
      "https://plaksha.edu.in/work-at-plaksha",
    ],
    content: `# Careers at Plaksha

## Overview

"Are you a driven professional with a passion for transformative change? Be part of a revolution in education at the forefront of shaping curious, young minds."

Plaksha seeks educators, innovators and professionals seeking work that has real world relevance within a vibrant ecosystem where your ideas matter.

## Open Position Categories

- **Faculty Roles** — Apply through Interfolio
- **Non-Faculty Roles** — Apply through the job portal (uknowva.com)
- **Teaching Fellows** — Apply via Google Form

## Core Values: CREATE

- **C**urious: Be open to explore, to be in awe of the world and its possibilities
- **R**igorous: Be complete, consistent and thorough in our plans and actions
- **E**nterprising: Be creative, agile and inventive in thought and action
- **A**uthentic: Supporting genuine contribution
- **T**hankful: Appreciation for colleagues and community
- **E**xemplary: Modeling these values for others

## Employee Recognition
- Spirit of Plaksha — Employee Awards
- Cultural events like The Battle of Bands

## Faculty Recruitment Contact
academic.relations@plaksha.edu.in | +91 172 412 6401`,
  },

  // ─── 14. CONTACT ───
  {
    slug: "contact",
    name: "Contact Information",
    description:
      "All phone numbers, email addresses, office contacts, department-wise contacts for Plaksha University",
    sourceUrls: [
      "https://plaksha.edu.in/contact-us",
    ],
    content: `# Contact Information

## Campus Address
Alpha, Sector 101, IT City Rd, Sahibzada Ajit Singh Nagar, Punjab 140306

The campus is a 10 minute drive from the Chandigarh International Airport.

## General Contacts
- **Phone:** +91 172 412 6260 | +91 172 497 6900
- **Email:** info@plaksha.edu.in

## Admissions

### Undergraduate (BTech)
- **Phone:** +91 63928 78527 | +91 98759 90813
- **Email:** apply@plaksha.edu.in

### PhD Program
- **Phone:** +91 172 412 6360
- **Email:** phd.academics@plaksha.edu.in

### Summer Programs (High School)
- **Phone:** +91 73035 80960
- **Email:** youngtechscholars@plaksha.edu.in

### Academic Relations & Faculty Recruitment
- **Phone:** +91 172 412 6401
- **Email:** academic.relations@plaksha.edu.in

## Administrative Offices

| Office | Name | Phone | Email |
|--------|------|-------|-------|
| Dean of Academics | Dr. Srikant Srinivasan | +91 172 412 6412 | dean.academics@plaksha.edu.in |
| Associate Dean | Dr. Manoj Kannan | +91 172 412 6426 | associatedean.asw@plaksha.edu.in |
| Dean of Research | Dr. Sunita Chauhan | +91 172 412 6414 | dean.research@plaksha.edu.in |
| Registrar | Abhay Sharma | +91 172 412 6290 | registrar@plaksha.edu.in |

## Student Life
- **Office Phone:** +91 98759 90805
- **Email:** studentlife@plaksha.edu.in
- **Associate Director (Karan Singh):** +91 70872 22381
- **Warden, Boys (Shashi Kant Dwivedi):** +91 70870 22281
- **Warden, Girls (Pooja Shradha):** +91 70870 22282

## Global Engagements
- **Associate Director (Harshita Tripathi):** +91 172 497 6871 | head.global@plaksha.edu.in
- **Manager (Rupsy Grewal):** global.engagements@plaksha.edu.in

## Financial Aid
- **Email:** financialaid.ug@plaksha.edu.in

## Career Development
- **Email:** career.development@plaksha.edu.in

## Clean Energy Center
- **Email:** manager.cleanenergy@plaksha.edu.in`,
  },

  // ─── 15. GENERAL (catch-all) ───
  {
    slug: "general",
    name: "General Information",
    description:
      "Miscellaneous information about Plaksha including virtual campus tour, social media, regulatory disclosures, newsletters, annual reports",
    sourceUrls: [
      "https://plaksha.edu.in",
      "https://plaksha.edu.in/regulatory-disclosure",
    ],
    content: `# General Information

## Virtual Campus Tour
Available at iviewd.com/plakshauni2

## Social Media
- Facebook
- Twitter
- Instagram
- LinkedIn
- YouTube

## Regulatory Disclosures

Plaksha University operates under the Punjab Private Universities Policy 2010. UGC notification received September 23, 2021. Formally recognized through the Plaksha University, Punjab Act, 2021.

### Statutory Bodies
- Board of Management
- Governing Body
- Academic Council
- Board of Studies
- Finance Committee

### Mandatory Committees
Academic integrity, anti-ragging, anti-drug, internal complaints, student grievances, data privacy, ethics, equal opportunity, caste-based discrimination prevention, student wellbeing.

### Compliance
UGC regulations including POSH guidelines, ragging prevention norms, student grievance redressal frameworks. Annual AISHE reports filed. SIRO recognition for research activities.

## Quick Links
- FAQs: plaksha.edu.in/faqs
- Blogs: plaksha.edu.in/blog
- Annual Reports: giving.plaksha.edu.in/resources
- National Ragging Prevention Programme
- UGC e-Samadhaan: samadhaan.ugc.ac.in
- Statements: plaksha.edu.in/statements

## Important Links
- University Grants Commission
- Ministry of Education

## Legal
- Terms and Conditions
- Privacy Policy

## Copyright
@Copyright reserved — Plaksha University`,
  },
];

// ─── KNOWLEDGE GRAPH EDGES ───

const edges: GraphEdge[] = [
  // Admissions cluster
  { fromSlug: "admissions", toSlug: "fees-financial-aid", relationship: "fee structure for admitted students" },
  { fromSlug: "admissions", toSlug: "undergraduate-programs", relationship: "programs available for admission" },
  { fromSlug: "admissions", toSlug: "contact", relationship: "admissions contact info" },
  { fromSlug: "fees-financial-aid", toSlug: "admissions", relationship: "financial aid as part of admission" },

  // Programs cluster
  { fromSlug: "undergraduate-programs", toSlug: "admissions", relationship: "how to apply" },
  { fromSlug: "undergraduate-programs", toSlug: "fees-financial-aid", relationship: "program costs" },
  { fromSlug: "undergraduate-programs", toSlug: "faculty", relationship: "who teaches" },
  { fromSlug: "undergraduate-programs", toSlug: "placements-careers", relationship: "career outcomes after graduation" },
  { fromSlug: "undergraduate-programs", toSlug: "entrepreneurship", relationship: "minor in tech entrepreneurship" },
  { fromSlug: "graduate-programs", toSlug: "faculty", relationship: "research supervisors" },
  { fromSlug: "graduate-programs", toSlug: "research", relationship: "research centers for PhD work" },
  { fromSlug: "graduate-programs", toSlug: "fees-financial-aid", relationship: "PhD stipends and fellowships" },

  // Faculty & research
  { fromSlug: "faculty", toSlug: "research", relationship: "faculty lead research centers" },
  { fromSlug: "faculty", toSlug: "undergraduate-programs", relationship: "faculty teach programs" },
  { fromSlug: "faculty", toSlug: "work-at-plaksha", relationship: "faculty recruitment" },
  { fromSlug: "research", toSlug: "faculty", relationship: "research center faculty" },
  { fromSlug: "research", toSlug: "graduate-programs", relationship: "PhD research areas" },

  // Campus & life
  { fromSlug: "campus-life", toSlug: "contact", relationship: "student life contacts" },
  { fromSlug: "campus-life", toSlug: "research", relationship: "campus labs and facilities" },
  { fromSlug: "campus-life", toSlug: "about", relationship: "campus location" },

  // Careers
  { fromSlug: "placements-careers", toSlug: "undergraduate-programs", relationship: "programs leading to careers" },
  { fromSlug: "placements-careers", toSlug: "partnerships-global", relationship: "recruiting companies" },

  // Global
  { fromSlug: "partnerships-global", toSlug: "about", relationship: "institutional partnerships" },
  { fromSlug: "partnerships-global", toSlug: "undergraduate-programs", relationship: "semester abroad and 4+1 pathways" },
  { fromSlug: "partnerships-global", toSlug: "graduate-programs", relationship: "co-created programs" },

  // Entrepreneurship
  { fromSlug: "entrepreneurship", toSlug: "undergraduate-programs", relationship: "minor program" },
  { fromSlug: "entrepreneurship", toSlug: "campus-life", relationship: "incubation space on campus" },

  // Summer programs
  { fromSlug: "summer-programs", toSlug: "admissions", relationship: "pathway to UG admission" },
  { fromSlug: "summer-programs", toSlug: "contact", relationship: "YTS contact" },

  // Work
  { fromSlug: "work-at-plaksha", toSlug: "faculty", relationship: "faculty openings" },
  { fromSlug: "work-at-plaksha", toSlug: "about", relationship: "university culture" },

  // Contact hub
  { fromSlug: "contact", toSlug: "admissions", relationship: "admissions inquiries" },
  { fromSlug: "contact", toSlug: "campus-life", relationship: "student life contacts" },

  // About links
  { fromSlug: "about", toSlug: "partnerships-global", relationship: "global partnerships" },
  { fromSlug: "about", toSlug: "faculty", relationship: "faculty overview" },
  { fromSlug: "about", toSlug: "research", relationship: "research centers" },
];

// ─── INDEX CONTENT ───

function buildIndex(topicDefs: TopicDef[]): string {
  const lines = topicDefs.map(
    (t) => `- **${t.slug}** — ${t.description}`
  );
  return `# Knowledge Index for plaksha.edu.in\n\n${lines.join("\n")}`;
}

// ─── MAIN ───

async function main() {
  await initAppDatabase();
  console.log(`[seed] Seeding ${topics.length} knowledge topics for ${SITE_ID}...`);

  for (const t of topics) {
    const tokenEstimate = Math.ceil(t.content.length / 4);
    console.log(`  [${t.slug}] ${t.name} (~${tokenEstimate} tokens)`);
    await upsertKnowledgeTopic({
      siteId: SITE_ID,
      slug: t.slug,
      name: t.name,
      description: t.description,
      content: t.content,
      sourceUrls: t.sourceUrls,
      tokenEstimate,
    });
  }

  console.log(`[seed] Inserting ${edges.length} knowledge graph edges...`);
  await upsertGraphEdges(SITE_ID, edges);

  const indexContent = buildIndex(topics);
  console.log(`[seed] Upserting knowledge index (${topics.length} topics)...`);
  await upsertKnowledgeIndex(SITE_ID, indexContent, topics.length);

  console.log(`\n[seed] Done! Seeded:`);
  console.log(`  - ${topics.length} topic files`);
  console.log(`  - ${edges.length} graph edges`);
  console.log(`  - 1 knowledge index`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
