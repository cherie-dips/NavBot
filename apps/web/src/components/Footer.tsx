interface FooterProps {
  onViewChange: (view: string) => void;
}

const socials = [
  { label: "Instagram", href: "#" },
  { label: "X (Twitter)", href: "#" },
  { label: "LinkedIn", href: "#" },
  { label: "YouTube", href: "#" },
];

export const Footer = (_props: FooterProps) => (
  <footer className="relative overflow-hidden border-t border-[#1f2522]/8 bg-[linear-gradient(180deg,#faf6ef_0%,#f6efe5_100%)] py-14">
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-[8%] top-[-10%] h-44 w-44 rounded-full bg-[#f2d4b8]/45 blur-3xl" />
      <div className="absolute bottom-[-10%] right-[12%] h-52 w-52 rounded-full bg-[#dbe5f1]/55 blur-3xl" />
    </div>

    <div className="container relative z-10 mx-auto px-6">
      <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
        <div className="max-w-md">
          <div className="font-display text-[2.2rem] font-semibold italic tracking-[-0.06em] text-[#1f2522]">
            navbot
          </div>
          <p className="mt-3 text-[1rem] leading-7 text-[#65726d]">
            Turn any website into a conversation with grounded answers, voice, and live content sync.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {socials.map((social) => (
            <a
              key={social.label}
              href={social.href}
              className="rounded-full border border-[#1f2522]/8 bg-white/65 px-4 py-2 text-sm font-medium text-[#4f5b57] shadow-[0_12px_24px_rgba(31,37,34,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#bc6c25]/25 hover:text-[#bc6c25]"
            >
              {social.label}
            </a>
          ))}
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-3 border-t border-[#1f2522]/8 pt-6 text-sm text-[#8a938f] md:flex-row md:items-center md:justify-between">
        <span>© navbot 2026. All rights reserved.</span>
        <span>Built for support, sales, and self-serve journeys.</span>
      </div>
    </div>
  </footer>
);
