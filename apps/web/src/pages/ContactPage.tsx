import { Mail, Phone, MapPin } from "lucide-react";

export const ContactPage = () => (
    <div className="animate-fade-in-up min-h-screen pt-32 pb-20 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#8EBFF2] opacity-20 rounded-full blur-[100px] animate-pulse" />
            <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] bg-[#8691CA] opacity-20 rounded-full blur-[100px] animate-pulse delay-700" />
            <div className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] bg-[#478EDB] opacity-10 rounded-full blur-[100px]" />
        </div>

        <div className="container mx-auto px-6 relative z-10">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-16">
                    <h1 className="font-serif text-5xl md:text-6xl font-light text-[#2E3538] mb-6">
                        Get in <span className="italic text-[#478EDB]">touch</span>
                    </h1>
                    <p className="text-xl text-slate-500 max-w-2xl mx-auto font-light">
                        We'd love to hear from you. Whether you have a question about features, pricing, or just want to say hello.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-12 bg-white rounded-[2.5rem] p-8 md:p-12 shadow-xl shadow-[#8691CA]/5 border border-slate-100">
                    <div className="space-y-8">
                        <h3 className="text-2xl font-serif text-[#2E3538]">Contact Information</h3>

                        <div className="space-y-6">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-[#F9F9FA] flex items-center justify-center text-[#478EDB]">
                                    <Mail className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[#2E3538] mb-1">Email</p>
                                    <a href="mailto:hello@navbot.ai" className="text-slate-500 hover:text-[#478EDB] transition-colors">hello@navbot.ai</a>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-[#F9F9FA] flex items-center justify-center text-[#478EDB]">
                                    <Phone className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[#2E3538] mb-1">Phone</p>
                                    <p className="text-slate-500">+1 (555) 123-4567</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-[#F9F9FA] flex items-center justify-center text-[#478EDB]">
                                    <MapPin className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[#2E3538] mb-1">Office</p>
                                    <p className="text-slate-500">123 AI Boulevard, Suite 100<br />San Francisco, CA 94107</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-8 mt-8 border-t border-slate-100">
                            <p className="text-slate-400 text-sm">Follow us on social media for updates.</p>
                        </div>
                    </div>

                    <form className="space-y-6">
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-[#2E3538]">First Name</label>
                                    <input type="text" className="w-full px-4 py-3 rounded-xl bg-[#F9F9FA] border border-slate-200 focus:border-[#478EDB] focus:bg-white outline-none transition-all duration-300" placeholder="John" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-[#2E3538]">Last Name</label>
                                    <input type="text" className="w-full px-4 py-3 rounded-xl bg-[#F9F9FA] border border-slate-200 focus:border-[#478EDB] focus:bg-white outline-none transition-all duration-300" placeholder="Doe" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[#2E3538]">Email Address</label>
                                <input type="email" className="w-full px-4 py-3 rounded-xl bg-[#F9F9FA] border border-slate-200 focus:border-[#478EDB] focus:bg-white outline-none transition-all duration-300" placeholder="john@company.com" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[#2E3538]">Message</label>
                                <textarea className="w-full px-4 py-3 rounded-xl bg-[#F9F9FA] border border-slate-200 focus:border-[#478EDB] focus:bg-white outline-none transition-all duration-300 h-32 resize-none" placeholder="Tell us about your project..."></textarea>
                            </div>
                        </div>

                        <button className="w-full py-4 bg-[#2E3538] text-white rounded-xl font-bold hover:bg-[#478EDB] transition-colors shadow-lg shadow-[#2E3538]/10 hover:shadow-[#478EDB]/20">
                            Send Message
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>
);
