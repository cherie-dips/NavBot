import { Code, Globe, MessageSquare, Mic } from "lucide-react";
import React from "react";

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

                            <div className="space-y-2 text-sm text-slate-500">
                                <p className="italic">Reads CSS variables</p>
                                <p className="italic">Matches fonts & radius</p>
                                <p className="italic">Respects layout system</p>
                            </div>

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

                            <div className="space-y-2 text-sm text-slate-500">
                                <p className="italic">Semantic chunking</p>
                                <p className="italic">Vector embeddings</p>
                                <p className="italic">Instant retrieval</p>
                            </div>

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

                            <div className="space-y-2 text-sm text-slate-500">
                                <p className="italic">Engagement tracking</p>
                                <p className="italic">Completion metrics</p>
                                <p className="italic">Improvement signals</p>
                            </div>

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

                            <div className="space-y-2 text-sm text-slate-500">
                                <p className="italic">Real-time speech</p>
                                <p className="italic">Multilingual support</p>
                                <p className="italic">Studio-quality output</p>
                            </div>

                        </div>

                    </div>



                    {/* ========== Feature 5 - Social Media Integration ========== */}
                    <div className="grid md:grid-cols-2 gap-20 items-center">

                        {/* Text */}
                        <div>

                            <span className="text-sm tracking-widest uppercase text-[#478EDB] font-medium mb-4 block">
                                Social sync
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
                                Live social media updates
                            </h3>

                            <p className="text-lg text-slate-600 leading-relaxed mb-8 max-w-md">
                                Connect your social channels and keep your chatbot current with your latest posts, updates, and announcements.
                            </p>

                            <div className="space-y-2 text-sm text-slate-500">
                                <p className="italic">Auto-sync from platforms</p>
                                <p className="italic">Real-time feed updates</p>
                                <p className="italic">Multi-platform support</p>
                            </div>

                        </div>


                        {/* Visual */}
                        <div className="relative">

                            <div className="relative w-full h-[340px] rounded-[2rem] overflow-hidden
                              bg-gradient-to-br from-[#478EDB]/20 to-[#8EBFF2]/20">

                                {/* Floating glow */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[#8691CA]/20 blur-3xl animate-pulse" />

                                {/* Main card */}
                                <div className="absolute inset-0 flex items-center justify-center">

                                    <div className="relative bg-white rounded-2xl p-6 shadow-xl border w-72">

                                        {/* Social icons orbit */}
                                        <div className="relative h-32 mb-4">
                                            
                                            {/* Center hub */}
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-gradient-to-br from-[#478EDB]/80 to-[#8691CA]/80 rounded-xl flex items-center justify-center shadow-lg">
                                                <MessageSquare className="w-6 h-6 text-white" />
                                            </div>

                                            {/* Orbiting social icons */}
                                            {/* Twitter/X */}
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center shadow-sm border border-slate-200/50 animate-orbit-1">
                                                <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                                </svg>
                                            </div>
                                            
                                            {/* Facebook */}
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center shadow-sm border border-blue-100/50 animate-orbit-2">
                                                <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                                </svg>
                                            </div>
                                            
                                            {/* LinkedIn */}
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center shadow-sm border border-blue-100/50 animate-orbit-3">
                                                <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                                                </svg>
                                            </div>
                                            
                                            {/* Instagram */}
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-pink-50 rounded-full flex items-center justify-center shadow-sm border border-pink-100/50 animate-orbit-4">
                                                <svg className="w-5 h-5 text-pink-400" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                                </svg>
                                            </div>

                                        </div>

                                        {/* Sync status */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-slate-600">Syncing posts...</span>
                                                <span className="text-[#478EDB] font-medium">Live</span>
                                            </div>
                                            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-[#478EDB]/70 to-[#8691CA]/70 rounded-full animate-progress" style={{ width: '70%' }}></div>
                                            </div>
                                        </div>

                                    </div>

                                </div>

                                {/* Floating update badges */}
                                <div className="absolute top-8 right-8 bg-white/90 backdrop-blur
                                px-3 py-1.5 rounded-full text-xs shadow-lg animate-float flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                                    New post
                                </div>

                                <div className="absolute bottom-8 left-8 bg-white/90 backdrop-blur
                                px-3 py-1.5 rounded-full text-xs shadow-lg animate-float delay-700 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></div>
                                    Updated
                                </div>

                            </div>

                        </div>

                    </div>


                </div>

            </div>

        </section>

    </div>
);