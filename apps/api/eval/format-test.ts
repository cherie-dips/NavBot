/**
 * Fast, offline checks for answer formatting. No API calls, so this can gate a build.
 */
import { formatAnswer } from "../src/services/answer-format";

const posts = [
  { url: "https://instagram.com/reel/A", platform: "instagram", title: "a" },
  { url: "https://linkedin.com/posts/B", platform: "linkedin", title: "b" },
  { url: "https://facebook.com/posts/C", platform: "facebook", title: "c" },
];

const raw = [
  "Events at Plaksha.",
  "",
  "• Fitoor cultural fest. [POST:1]",
  "• Summit and conference. [POST:2, 3]",
  "• Something unmatched. [POST:99]",
  "• Malformed tag. [POST:]",
  "• Bare url https://www.instagram.com/reel/XYZ/ inline.",
  "",
  "[RELEVANT_PAGES]",
  "https://plaksha.edu.in/ug",
  "[/RELEVANT_PAGES]",
  "",
  "[FOLLOW_UPS]",
  "What is Fitoor?",
  "[/FOLLOW_UPS]",
].join("\n");

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok || !detail ? "" : "\n          " + detail}`);
  if (!ok) failures++;
}

const r = formatAnswer({ raw, siteId: "plaksha.edu.in", docs: [], posts });
console.log("--- answer ---\n" + r.answer + "\n--------------\n");

check("resolves single index to URL", r.answer.includes("[POST:https://instagram.com/reel/A]"));
check("resolves first of a comma list", r.answer.includes("[POST:https://linkedin.com/posts/B]"));
check(
  "drops out-of-range index",
  !/\[POST:\s*99/.test(r.answer),
  r.answer
);
check("drops malformed tag", !/\[POST:\s*\]/.test(r.answer));
check(
  "leaves no unresolved POST tags",
  !/\[POST:(?!https?:\/\/)/i.test(r.answer),
  r.answer
);
check(
  "strips bare social URLs from prose",
  !/instagram\.com\/reel\/XYZ/.test(r.answer),
  r.answer
);
check("collects cited posts in order", r.citedPosts?.map((p) => p.url).join(",") ===
  "https://instagram.com/reel/A,https://linkedin.com/posts/B");
check("extracts follow-ups", r.followUps.join("|") === "What is Fitoor?");
check("strips block markers", !/RELEVANT_PAGES|FOLLOW_UPS/.test(r.answer));

// Truncated generation: the trailing fragment must go, earlier bullets must stay.
const truncated = [
  "Campus events include several things.",
  "",
  "• Fitoor, the cultural fest.",
  "• Meal plan costs ₹72,000 per year",
  "• Plakshathon, a 5 KM run to support workers",
].join("\n");
const t = formatAnswer({ raw: truncated, siteId: "plaksha.edu.in", docs: [], posts: [] });
check("drops only the final unterminated line", t.answer.includes("Meal plan costs") && !t.answer.includes("5 KM run"), t.answer);

console.log(`\n${failures === 0 ? "all checks passed" : failures + " check(s) failed"}`);
process.exit(failures === 0 ? 0 : 1);
