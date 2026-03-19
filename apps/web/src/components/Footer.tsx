interface FooterProps {
    onViewChange: (view: string) => void;
}

export const Footer = ({ onViewChange }: FooterProps) => (
    <footer className="py-12 bg-white border-t border-slate-100">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => onViewChange("home")}>
                <span className="text-lg font-medium italic text-[#2E3538] font-serif">navbot</span>
            </div>
            <div className="flex gap-8 text-sm text-slate-500">
                <a href="#" onClick={(e) => { e.preventDefault(); onViewChange("features"); }} className="hover:text-[#478EDB] transition-colors">Features</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onViewChange("pricing"); }} className="hover:text-[#478EDB] transition-colors">Pricing</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onViewChange("contact"); }} className="hover:text-[#478EDB] transition-colors">Contact</a>
                <a href="#" className="hover:text-[#478EDB] transition-colors">Privacy</a>
            </div>
            <div className="text-sm text-slate-400">© 2026 NavBot</div>
        </div>
    </footer>
);