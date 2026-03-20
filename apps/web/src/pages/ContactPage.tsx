import { Mail, Phone, MapPin } from "lucide-react";

export const ContactPage = () => (
    <div className="animate-fade-in-up min-h-screen pt-32 pb-20 relative overflow-hidden bg-[#f8f4ee] text-[#1f2522]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#f2d4b8] opacity-30 rounded-full blur-[100px] animate-pulse" />
            <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] bg-[#dbe5f1] opacity-25 rounded-full blur-[100px] animate-pulse delay-700" />
            <div className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] bg-[#f6eee3] opacity-80 rounded-full blur-[100px]" />
        </div>

        <div className="container mx-auto px-6 relative z-10">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-16">
                    <h1 className="text-5xl md:text-6xl font-light text-[#1f2522] mb-6 tracking-[-0.05em]">
                        Get in <span className="font-display italic text-[#bc6c25]">touch</span>
                    </h1>
                    <p className="text-xl text-[#65726d] max-w-2xl mx-auto font-light">
                        We'd love to hear from you. Whether you have a question about features, pricing, or just want to say hello.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-12 bg-white/80 rounded-[2.5rem] p-8 md:p-12 shadow-[0_24px_50px_rgba(31,37,34,0.06)] border border-white/90 backdrop-blur">
                    <div className="space-y-8">
                        <h3 className="text-2xl font-display text-[#1f2522]">Contact Information</h3>

                        <div className="space-y-6">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-[#f6eee3] flex items-center justify-center text-[#bc6c25]">
                                    <Mail className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[#1f2522] mb-1">Email</p>
                                    <a href="mailto:hello@navbot.ai" className="text-[#65726d] hover:text-[#bc6c25] transition-colors">hello@navbot.ai</a>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-[#edf2f7] flex items-center justify-center text-[#456a92]">
                                    <Phone className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[#1f2522] mb-1">Phone</p>
                                    <p className="text-[#65726d]">+1 (555) 123-4567</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-[#f6eee3] flex items-center justify-center text-[#bc6c25]">
                                    <MapPin className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[#1f2522] mb-1">Office</p>
                                    <p className="text-[#65726d]">123 AI Boulevard, Suite 100<br />San Francisco, CA 94107</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-8 mt-8 border-t border-[#1f2522]/10">
                            <p className="text-[#8a938f] text-sm">Follow us on social media for updates.</p>
                        </div>
                    </div>

                    <form className="space-y-6">
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-[#1f2522]">First Name</label>
                                    <input type="text" className="w-full px-4 py-3 rounded-xl bg-[#fbfaf7] border border-slate-200 focus:border-[#bc6c25] focus:bg-white outline-none transition-all duration-300" placeholder="John" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-[#1f2522]">Last Name</label>
                                    <input type="text" className="w-full px-4 py-3 rounded-xl bg-[#fbfaf7] border border-slate-200 focus:border-[#bc6c25] focus:bg-white outline-none transition-all duration-300" placeholder="Doe" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[#1f2522]">Email Address</label>
                                <input type="email" className="w-full px-4 py-3 rounded-xl bg-[#fbfaf7] border border-slate-200 focus:border-[#bc6c25] focus:bg-white outline-none transition-all duration-300" placeholder="john@company.com" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[#1f2522]">Message</label>
                                <textarea className="w-full px-4 py-3 rounded-xl bg-[#fbfaf7] border border-slate-200 focus:border-[#bc6c25] focus:bg-white outline-none transition-all duration-300 h-32 resize-none" placeholder="Tell us about your project..."></textarea>
                            </div>
                        </div>

                        <button className="w-full py-4 bg-[#1f2522] text-white rounded-xl font-bold hover:bg-[#bc6c25] transition-colors shadow-[0_20px_45px_rgba(31,37,34,0.12)]">
                            Send Message
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>
);
