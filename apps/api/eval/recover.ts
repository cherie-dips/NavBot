import "dotenv/config";
import { getSocialHandles } from "../src/services/db";
import { socialProfileLinks, searchSocialMedia } from "../src/services/social-search";
import { getSiteProfile } from "../src/services/site-profile";

async function main() {
  const siteId = process.env.EVAL_SITE_ID || "plaksha.edu.in";
  console.log("DB handles:     ", JSON.stringify(await getSocialHandles(siteId)));
  console.log("Profile default:", JSON.stringify(getSiteProfile(siteId).socialHandles));

  const res = await searchSocialMedia(siteId, "campus events");
  console.log("\nprofileUrl produced per platform:");
  const seen = new Set<string>();
  for (const r of res) {
    if (seen.has(r.platform)) continue;
    seen.add(r.platform);
    console.log(`  ${r.platform.padEnd(10)} ${r.profileUrl}`);
  }
  console.log("\nsocialProfileLinks():");
  for (const p of socialProfileLinks(res)) console.log(`  ${p.title.padEnd(10)} ${p.url}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
