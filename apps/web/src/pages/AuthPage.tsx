import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Mail } from "lucide-react";
import { authClient } from "../lib/auth-client";

interface AuthPageProps {
    onViewChange: (view: string) => void;
    onAuthSuccess: () => void;
}

export const AuthPage = ({ onViewChange, onAuthSuccess }: AuthPageProps) => {
    const [mode, setMode] = useState<"login" | "signup">("login");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [oauthLoading, setOauthLoading] = useState<string | null>(null);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            if (mode === "signup") {
                const { error: err } = await authClient.signUp.email({
                    email,
                    password,
                    name,
                });
                if (err) throw new Error(err.message || "Sign up failed.");
            } else {
                const { error: err } = await authClient.signIn.email({
                    email,
                    password,
                });
                if (err) throw new Error(err.message || "Sign in failed. Check your credentials.");
            }
            onAuthSuccess();
        } catch (err: any) {
            setError(err.message || "Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleOAuth = async (provider: "github" | "google") => {
        setError("");
        setOauthLoading(provider);
        try {
            await authClient.signIn.social({
                provider,
                callbackURL: `${window.location.origin}?auth=success`,
            });
        } catch (e: any) {
            const msg = e?.message || "";
            const isNetwork = /fetch|network|failed|refused|ERR_/i.test(msg);
            setError(
                isNetwork
                    ? `Sign-in service unavailable. Run the auth server (pnpm --filter server dev) and set ${provider === "google" ? "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" : "GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET"} in apps/server/.env. Or sign in with email below.`
                    : `Failed to sign in with ${provider}. ${msg ? ` ${msg}` : "Try email sign-in or check server config."}`
            );
        } finally {
            setOauthLoading(null);
        }
    };

    return (
        <div className="animate-fade-in-up min-h-screen pt-24 pb-20 relative overflow-hidden flex items-center justify-center">
            {/* Ambient background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#8EBFF2] opacity-20 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] bg-[#8691CA] opacity-20 rounded-full blur-[100px] animate-pulse delay-700" />
                <div className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] bg-[#478EDB] opacity-10 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 w-full max-w-md mx-auto px-6">
                {/* Brand */}
                <div className="text-center mb-10">
                    <button
                        onClick={() => onViewChange("home")}
                        className="text-2xl font-medium italic text-[#2E3538] font-serif tracking-tight mb-4 block mx-auto hover:text-[#478EDB] transition-colors"
                    >
                        navbot
                    </button>
                    <h1 className="font-serif text-3xl font-light text-[#2E3538] mb-2">
                        {mode === "login" ? "Welcome back" : "Get started"}
                    </h1>
                    <p className="text-slate-500 text-sm font-light">
                        {mode === "login"
                            ? "Sign in to access your NavBot dashboard"
                            : "Create your account to add NavBot to your website"}
                    </p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-[2rem] p-8 shadow-xl shadow-[#8691CA]/8 border border-slate-100">
                    {/* Mode Toggle */}
                    <div className="flex p-1 bg-[#F9F9FA] rounded-xl mb-8">
                        {(["login", "signup"] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => { setMode(m); setError(""); }}
                                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                                    mode === m
                                        ? "bg-white text-[#2E3538] shadow-sm"
                                        : "text-slate-400 hover:text-slate-600"
                                }`}
                            >
                                {m === "login" ? "Sign In" : "Sign Up"}
                            </button>
                        ))}
                    </div>

                    {/* OAuth Buttons */}
                    <div className="space-y-3 mb-6">
                        <button
                            onClick={() => handleOAuth("github")}
                            disabled={!!oauthLoading}
                            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-slate-200 bg-[#F9F9FA] hover:bg-white hover:border-[#2E3538]/30 transition-all duration-200 text-sm font-medium text-[#2E3538] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {oauthLoading === "github" ? (
                                <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                            ) : (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                </svg>
                            )}
                            Continue with GitHub
                        </button>
                        <button
                            onClick={() => handleOAuth("google")}
                            disabled={!!oauthLoading}
                            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-slate-200 bg-[#F9F9FA] hover:bg-white hover:border-[#478EDB]/30 transition-all duration-200 text-sm font-medium text-[#2E3538] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {oauthLoading === "google" ? (
                                <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                            ) : (
                                <svg className="w-4 h-4" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                </svg>
                            )}
                            Continue with Google
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-4 mb-6">
                        <div className="flex-1 h-px bg-slate-100" />
                        <span className="text-xs text-slate-400">or continue with email</span>
                        <div className="flex-1 h-px bg-slate-100" />
                    </div>

                    {/* Email Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === "signup" && (
                            <div>
                                <label className="block text-xs font-medium text-[#2E3538] mb-1.5">Full Name</label>
                                <input
                                    type="text"
                                    placeholder="Jane Smith"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 rounded-xl bg-[#F9F9FA] border border-slate-200 focus:border-[#478EDB] focus:bg-white outline-none transition-all duration-200 text-sm text-[#2E3538] placeholder:text-slate-400"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-medium text-[#2E3538] mb-1.5">Email</label>
                            <div className="relative">
                                <input
                                    type="email"
                                    placeholder="you@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 pr-10 rounded-xl bg-[#F9F9FA] border border-slate-200 focus:border-[#478EDB] focus:bg-white outline-none transition-all duration-200 text-sm text-[#2E3538] placeholder:text-slate-400"
                                />
                                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-xs font-medium text-[#2E3538]">Password</label>
                                {mode === "login" && (
                                    <button type="button" className="text-xs text-[#478EDB] hover:text-[#2E3538] transition-colors">
                                        Forgot password?
                                    </button>
                                )}
                            </div>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={8}
                                    className="w-full px-4 py-3 pr-10 rounded-xl bg-[#F9F9FA] border border-slate-200 focus:border-[#478EDB] focus:bg-white outline-none transition-all duration-200 text-sm text-[#2E3538] placeholder:text-slate-400"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="group w-full py-3.5 bg-[#2E3538] text-white rounded-xl text-sm font-medium hover:bg-[#478EDB] transition-all duration-300 shadow-lg shadow-[#2E3538]/10 hover:shadow-[#478EDB]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span>{mode === "login" ? "Sign In" : "Create Account"}</span>
                                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                                </>
                            )}
                        </button>
                    </form>

                    {mode === "signup" && (
                        <p className="text-center text-xs text-slate-400 mt-4">
                            By creating an account, you agree to our{" "}
                            <a href="#" className="text-[#478EDB] hover:underline">Terms</a> and{" "}
                            <a href="#" className="text-[#478EDB] hover:underline">Privacy Policy</a>.
                        </p>
                    )}
                </div>

                <p className="text-center text-sm text-slate-500 mt-6">
                    {mode === "login" ? "Don't have an account? " : "Already have an account? "}
                    <button
                        onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
                        className="text-[#478EDB] font-medium hover:text-[#2E3538] transition-colors"
                    >
                        {mode === "login" ? "Sign up free" : "Sign in"}
                    </button>
                </p>
            </div>
        </div>
    );
};