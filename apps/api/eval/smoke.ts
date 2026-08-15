import "dotenv/config";
import { getSiteProfile, DEFAULT_SOCIAL_PLATFORMS } from "../src/services/site-profile";
import { searchSocialMedia } from "../src/services/social-search";

async function main() {
  console.log(`DEFAULT_SOCIAL_PLATFORMS: ${DEFAULT_SOCIAL_PLATFORMS.join(", ")}\n`);

  for (const siteId of ["plaksha.edu.in", "example.com"]) {
    const p = getSiteProfile(siteId);
    const effective = p.enabledSocialPlatforms ?? DEFAULT_SOCIAL_PLATFORMS;
    console.log(`${siteId.padEnd(18)} explicit=${JSON.stringify(p.enabledSocialPlatforms)} effective=[${effective.join(", ")}]`);
  }

  // Plaksha has all four handles saved in the dashboard; only two may be used.
  const res = await searchSocialMedia("plaksha.edu.in", "campus events");
  const platforms = [...new Set(res.map((r) => r.platform))].sort();
  console.log(`\nlive search returned platforms: [${platforms.join(", ")}] over ${res.length} results`);
  const leaked = platforms.filter((p) => !DEFAULT_SOCIAL_PLATFORMS.includes(p as never));
  console.log(leaked.length ? `LEAKED: ${leaked.join(", ")}` : "clean — no disabled platform present");
  process.exit(leaked.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
