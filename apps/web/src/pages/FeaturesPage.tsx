import { Code, Globe, MessageSquare, Mic } from "lucide-react";

export const FeaturesPage = () => (
    <div className="animate-fade-in-up min-h-screen pt-32 pb-20">
        {/* Features Section */}
        <section className="py-40 bg-[#F9F9FA] relative overflow-hidden">

            {/* Ambient background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#8EBFF2] opacity-20 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] bg-[#8691CA] opacity-20 rounded-full blur-[100px] animate-pulse delay-700" />
                <div className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] bg-[#478EDB] opacity-10 rounded-full blur-[100px]" />
            </div>


            <div className="container mx-auto px-6 max-w-6xl relative z-10">

                {/* Header */}
                <div className="text-center mb-36">

                    <h2 className="font-serif text-5xl md:text-6xl font-light text-[#2E3538] mb-8 leading-tight">

                        Features that
                        <span className="italic text-[#8691CA]"> disappear</span>,
                        <br />
                        so your product can
                        <span className="italic text-[#478EDB]"> shine</span>

                    </h2>

                    <p className="text-xl text-slate-500 max-w-2xl mx-auto font-light leading-relaxed">
                        Every tool is crafted to feel natural —
                        powerful when needed, invisible when not.
                    </p>

                </div>


                {/* Timeline */}
                <div className="space-y-48">


                    {/* ========== Feature 1 ========== */}
                    <div className="grid md:grid-cols-2 gap-20 items-center">

                        {/* Text */}
                        <div>

                            <span className="text-sm tracking-widest uppercase text-[#478EDB] font-medium mb-4 block">
                                Visual identity
                            </span>

                            <h3
                                className="group relative inline-block font-serif text-4xl font-semibold text-[#2E3538] mb-8 leading-snug
                           after:absolute after:left-0 after:-bottom-2
                           after:w-full after:h-[2px]
                           after:bg-gradient-to-r after:from-[#478EDB] after:to-[#8691CA]
                           after:scale-x-0 after:origin-left
                           after:transition-transform after:duration-500
                           hover:after:scale-x-100"
                            >
                                Automatic theme matching
                            </h3>

                            <p className="text-lg text-slate-600 leading-relaxed mb-8 max-w-md">
                                NavBot quietly studies your interface —
                                colors, typography, spacing —
                                and adapts itself without configuration.
                            </p>

                            <ul className="space-y-3 text-sm text-slate-500 font-medium">
                                <li>• Reads CSS variables</li>
                                <li>• Matches fonts & radius</li>
                                <li>• Respects layout system</li>
                            </ul>

                        </div>


                        {/* Visual */}
                        <div className="relative">

                            <div className="relative w-full h-[340px] rounded-[2rem] overflow-hidden
                              bg-gradient-to-br from-[#8EBFF2]/30 to-[#8691CA]/30">

                                {/* Floating glow */}
                                <div className="absolute top-12 left-12 w-40 h-40 bg-[#478EDB]/30 blur-3xl animate-pulse" />

                                {/* Main card */}
                                <div className="absolute inset-0 flex items-center justify-center">

                                    <div className="relative bg-white rounded-2xl p-7 shadow-xl border w-64 animate-float">

                                        <Code className="w-8 h-8 mb-4 text-[#478EDB]" />

                                        <p className="text-sm font-semibold mb-3">Theme detected</p>

                                        <div className="space-y-2">
                                            <div className="h-2 bg-[#478EDB]/40 rounded w-4/5"></div>
                                            <div className="h-2 bg-[#8691CA]/40 rounded w-3/5"></div>
                                            <div className="h-2 bg-slate-100 rounded w-full"></div>
                                        </div>

                                    </div>

                                </div>

                                {/* Floating tags */}
                                <div className="absolute bottom-6 left-6 bg-white/80 backdrop-blur
                                px-3 py-1 rounded-full text-xs shadow animate-float delay-200">
                                    #478EDB
                                </div>

                                <div className="absolute top-6 right-6 bg-white/80 backdrop-blur
                                px-3 py-1 rounded-full text-xs shadow animate-float delay-500">
                                    Inter
                                </div>

                            </div>

                        </div>

                    </div>



                    {/* ========== Feature 2 ========== */}
                    <div className="grid md:grid-cols-2 gap-20 items-center">

                        {/* Visual */}
                        <div className="relative order-2 md:order-1">

                            <div className="relative w-full h-[340px] rounded-[2rem] overflow-hidden
                              bg-gradient-to-br from-[#8691CA]/30 to-[#478EDB]/30">

                                {/* Scan line */}
                                <div className="absolute inset-x-0 h-1 bg-[#478EDB]/60 animate-scan" />

                                {/* Particles */}
                                {[...Array(7)].map((_, i) => (
                                    <div
                                        key={i}
                                        className="absolute w-2 h-2 bg-[#8EBFF2] rounded-full opacity-70 animate-ping"
                                        style={{
                                            top: `${40 + i * 35}px`,
                                            left: `${40 + i * 30}px`,
                                            animationDelay: `${i * 0.4}s`
                                        }}
                                    />
                                ))}


                                {/* Card */}
                                <div className="absolute inset-0 flex items-center justify-center">

                                    <div className="bg-white rounded-2xl p-7 shadow-xl border w-64">

                                        <Globe className="w-8 h-8 mb-4 text-[#478EDB]" />

                                        <div className="space-y-3">
                                            <div className="h-2 bg-slate-100 rounded"></div>
                                            <div className="h-2 bg-[#478EDB]/40 rounded w-4/5"></div>
                                            <div className="h-2 bg-slate-100 rounded w-3/5"></div>
                                        </div>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* Text */}
                        <div className="order-1 md:order-2">

                            <span className="text-sm tracking-widest uppercase text-[#478EDB] font-medium mb-4 block">
                                Knowledge engine
                            </span>

                            <h3
                                className="group relative inline-block font-serif text-4xl font-semibold text-[#2E3538] mb-8
                           after:absolute after:left-0 after:-bottom-2
                           after:w-full after:h-[2px]
                           after:bg-gradient-to-r after:from-[#478EDB] after:to-[#8691CA]
                           after:scale-x-0 after:origin-left
                           after:transition-transform after:duration-500
                           hover:after:scale-x-100"
                            >
                                Smart content indexing
                            </h3>

                            <p className="text-lg text-slate-600 leading-relaxed mb-8 max-w-md">
                                Every page becomes searchable,
                                structured, and context-aware —
                                ready for real conversations.
                            </p>

                            <ul className="space-y-3 text-sm text-slate-500 font-medium">
                                <li>• Semantic chunking</li>
                                <li>• Vector embeddings</li>
                                <li>• Instant retrieval</li>
                            </ul>

                        </div>

                    </div>



                    {/* ========== Feature 3 ========== */}
                    <div className="grid md:grid-cols-2 gap-20 items-center">

                        {/* Text */}
                        <div>

                            <span className="text-sm tracking-widest uppercase text-[#478EDB] font-medium mb-4 block">
                                Insights
                            </span>

                            <h3
                                className="group relative inline-block font-serif text-4xl font-semibold text-[#2E3538] mb-8
                           after:absolute after:left-0 after:-bottom-2
                           after:w-full after:h-[2px]
                           after:bg-gradient-to-r after:from-[#478EDB] after:to-[#8691CA]
                           after:scale-x-0 after:origin-left
                           after:transition-transform after:duration-500
                           hover:after:scale-x-100"
                            >
                                Analytics dashboard
                            </h3>

                            <p className="text-lg text-slate-600 leading-relaxed mb-8 max-w-md">
                                Learn how people explore your content —
                                what they ask, skip, and revisit.
                            </p>

                            <ul className="space-y-3 text-sm text-slate-500 font-medium">
                                <li>• Engagement tracking</li>
                                <li>• Completion metrics</li>
                                <li>• Improvement signals</li>
                            </ul>

                        </div>


                        {/* Visual */}
                        <div>

                            <div className="relative w-full h-[340px] rounded-[2rem] overflow-hidden
                              bg-gradient-to-br from-[#478EDB]/30 to-[#8EBFF2]/30">

                                {/* Glow */}
                                <div className="absolute bottom-0 right-0 w-40 h-40 bg-[#8691CA]/30 blur-3xl" />


                                <div className="absolute inset-0 flex items-center justify-center">

                                    <div className="bg-white rounded-2xl p-7 shadow-xl border w-64">

                                        <MessageSquare className="w-8 h-8 mb-4 text-[#478EDB]" />

                                        {/* Chart */}
                                        <div className="flex items-end gap-2 h-24">

                                            {[40, 60, 30, 80, 55, 90].map((h, i) => (
                                                <div
                                                    key={i}
                                                    className="w-4 bg-[#478EDB]/60 rounded-t animate-grow"
                                                    style={{
                                                        height: `${h}%`,
                                                        animationDelay: `${i * 0.2}s`
                                                    }}
                                                />
                                            ))}

                                        </div>

                                    </div>

                                </div>

                            </div>

                        </div>

                    </div>



                    {/* ========== Feature 4 ========== */}
                    <div className="grid md:grid-cols-2 gap-20 items-center">

                        {/* Visual */}
                        <div className="order-2 md:order-1">

                            <div className="relative w-full h-[340px] rounded-[2rem] overflow-hidden
                              bg-gradient-to-br from-[#8EBFF2]/30 to-[#8691CA]/30">

                                {/* Waves */}
                                <div className="absolute inset-0 flex items-center justify-center gap-2">

                                    {[...Array(14)].map((_, i) => (
                                        <div
                                            key={i}
                                            className="w-2 bg-[#478EDB]/70 rounded-full animate-wave"
                                            style={{
                                                height: `${30 + (i % 5) * 16}px`,
                                                animationDelay: `${i * 0.1}s`
                                            }}
                                        />
                                    ))}

                                </div>


                                {/* Card */}
                                <div className="absolute inset-0 flex items-center justify-center">

                                    <div className="bg-white rounded-2xl p-7 shadow-xl border w-56 text-center">

                                        <Mic className="w-8 h-8 mx-auto mb-4 text-[#478EDB]" />

                                        <p className="text-sm font-medium">Listening…</p>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* Text */}
                        <div className="order-1 md:order-2">

                            <span className="text-sm tracking-widest uppercase text-[#478EDB] font-medium mb-4 block">
                                Interaction
                            </span>

                            <h3
                                className="group relative inline-block font-serif text-4xl font-semibold text-[#2E3538] mb-8
                           after:absolute after:left-0 after:-bottom-2
                           after:w-full after:h-[2px]
                           after:bg-gradient-to-r after:from-[#478EDB] after:to-[#8691CA]
                           after:scale-x-0 after:origin-left
                           after:transition-transform after:duration-500
                           hover:after:scale-x-100"
                            >
                                Voice interactions
                            </h3>

                            <p className="text-lg text-slate-600 leading-relaxed mb-8 max-w-md">
                                Let users speak naturally —
                                with instant, accurate audio responses.
                            </p>

                            <ul className="space-y-3 text-sm text-slate-500 font-medium">
                                <li>• Real-time speech</li>
                                <li>• Multilingual support</li>
                                <li>• Studio-quality output</li>
                            </ul>

                        </div>

                    </div>


                </div>

            </div>

        </section>

    </div>
);

// import { BarChart2, MessageCircle, Mic, Sparkles } from "lucide-react";

// const features = [
//   {
//     id: 1,
//     tag: "Seamless design",
//     title: "Blends naturally with your website",
//     description:
//       "The chatbot uses a soft glass-style interface that fits into your website without standing out. It feels native, clean, and intentional.",
//     points: [
//       "Matches your colors and layout",
//       "Glass-style transparent interface",
//       "Clean and distraction-free",
//     ],
//     icon: <Sparkles className="w-6 h-6" />,
//     image: "/images/glass-ui.png",
//   },
//   {
//     id: 2,
//     tag: "Knowledge engine",
//     title: "Understands your website content",
//     description:
//       "Your chatbot learns from your pages and gives clear, relevant answers based on your actual content.",
//     points: [
//       "Learns from your pages automatically",
//       "Context-aware replies",
//       "Auto-updates when content changes",
//     ],
//     icon: <MessageCircle className="w-6 h-6" />,
//     image: "/images/knowledge.png",
//   },
//   {
//     id: 3,
//     tag: "Insights",
//     title: "Track what users really need",
//     description:
//       "Understand how visitors interact with your chatbot and improve your content using real data.",
//     points: [
//       "Most asked questions",
//       "User engagement stats",
//       "Conversation performance",
//     ],
//     icon: <BarChart2 className="w-6 h-6" />,
//     image: "/images/dashboard.png",
//     animated: true,
//   },
//   {
//     id: 4,
//     tag: "Voice support",
//     title: "Talk to your chatbot naturally",
//     description:
//       "Let users speak instead of typing and receive fast, clear voice responses in real time.",
//     points: [
//       "Real-time voice support",
//       "Multiple languages",
//       "Natural sounding audio",
//     ],
//     icon: <Mic className="w-6 h-6" />,
//     image: "/images/voice.png",
//   },
// ];

// export default function FeaturesSection() {
//   return (
//     <section className="py-32 bg-[#F9F9FA] overflow-hidden">
//       <div className="container mx-auto px-6">

//         <div className="text-center mb-28">
//           <h2 className="font-serif text-5xl md:text-6xl font-light text-[#2E3538] mb-6">
//             Built to feel effortless
//           </h2>

//           <p className="text-xl text-slate-500 max-w-2xl mx-auto font-light">
//             Powerful features that stay out of your way and blend into your
//             product naturally.
//           </p>
//         </div>

//         <div className="space-y-36 max-w-6xl mx-auto">

//           {features.map((feature, index) => {
//             const reverse = index % 2 !== 0;

//             return (
//               <div
//                 key={feature.id}
//                 className={`group grid md:grid-cols-2 gap-20 items-center ${
//                   reverse ? "md:flex-row-reverse" : ""
//                 }`}
//               >
//                 <div
//                   className={`relative rounded-3xl p-10 bg-gradient-to-br from-white/60 to-white/30 backdrop-blur-xl border border-white/40 shadow-lg transition-all duration-500 ${
//                     feature.animated
//                       ? "group-hover:scale-105 group-hover:shadow-2xl group-hover:shadow-[#478EDB]/20"
//                       : "group-hover:shadow-xl"
//                   }`}
//                 >
//                   <div
//                     className={`w-full h-full rounded-2xl bg-cover bg-center transition-transform duration-700 ${
//                       feature.animated
//                         ? "group-hover:scale-110"
//                         : "group-hover:scale-105"
//                     }`}
//                     style={{
//                       backgroundImage: `url(${feature.image})`,
//                       minHeight: "280px",
//                     }}
//                   />

//                   {feature.animated && (
//                     <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-[#478EDB]/10 to-[#8691CA]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
//                   )}
//                 </div>

//                 <div>

//                   <span className="text-sm tracking-widest uppercase text-[#478EDB] font-medium mb-4 block">
//                     {feature.tag}
//                   </span>

//                   <h3
//                     className="relative inline-block font-serif text-4xl md:text-5xl font-semibold text-[#2E3538] mb-8 leading-snug
//                                after:absolute after:left-0 after:-bottom-2
//                                after:w-full after:h-[2px]
//                                after:bg-gradient-to-r after:from-[#478EDB] after:to-[#8691CA]
//                                after:scale-x-0 after:origin-left
//                                after:transition-transform after:duration-500
//                                group-hover:after:scale-x-100"
//                   >
//                     {feature.title}
//                   </h3>

//                   <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-8 max-w-md">
//                     {feature.description}
//                   </p>

//                   <ul className="space-y-4 text-base md:text-lg text-slate-600 font-medium">
//                     {feature.points.map((point, i) => (
//                       <li
//                         key={i}
//                         className="flex items-center gap-3 transition-transform duration-300 group-hover:translate-x-1"
//                       >
//                         <span className="w-2 h-2 rounded-full bg-[#478EDB]" />
//                         {point}
//                       </li>
//                     ))}
//                   </ul>

//                 </div>
//               </div>
//             );
//           })}

//         </div>
//       </div>
//     </section>
//   );
// }

