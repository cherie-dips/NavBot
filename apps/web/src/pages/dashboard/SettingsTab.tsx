import {
  Globe,
  Volume2,
  VolumeX,
} from "lucide-react";
import { DailyLimitPanel } from "./DailyLimitPanel";
import { Toggle } from "./Toggle";
import { DASH_PANEL } from "./styles";
import type { Website } from "./types";

export function SettingsTab({ voiceEnabled, setVoiceEnabled, webDataOnly, setWebDataOnly, activeSite }: {
  voiceEnabled: boolean; setVoiceEnabled: (v: boolean) => void;
  webDataOnly: boolean; setWebDataOnly: (v: boolean) => void;
  activeSite: Website | null;
}) {
  return (
    <div className="space-y-4">
      <DailyLimitPanel activeSite={activeSite} />
      <div className={`${DASH_PANEL} p-6`}>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${voiceEnabled ? "bg-[#f6eee3]" : "bg-[#f3eee7]"}`}>
              {voiceEnabled ? <Volume2 className="h-5 w-5 text-[#bc6c25]" /> : <VolumeX className="h-5 w-5 text-[#8a938f]" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-[#1f2522]">Voice input & responses</h3>
              <p className="mt-0.5 text-xs text-[#8a938f]">Visitors can speak questions and hear answers read aloud.</p>
            </div>
          </div>
          <Toggle enabled={voiceEnabled} onChange={setVoiceEnabled} color="#bc6c25" />
        </div>
      </div>

      <div className={`${DASH_PANEL} p-6`}>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${webDataOnly ? "bg-green-100" : "bg-[#f3eee7]"}`}>
              <Globe className={`h-5 w-5 ${webDataOnly ? "text-green-600" : "text-[#8a938f]"}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-[#1f2522]">Website-only answers</h3>
              <p className="mt-0.5 text-xs text-[#8a938f]">Bot only uses your indexed pages — never external sources.</p>
            </div>
          </div>
          <Toggle enabled={webDataOnly} onChange={setWebDataOnly} color="#22c55e" />
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-red-100 bg-white/76 p-6 shadow-[0_18px_40px_rgba(31,37,34,0.045)] backdrop-blur-xl">
        <h3 className="text-sm font-semibold text-red-600 mb-1">Danger zone</h3>
        <p className="mb-4 text-xs text-[#8a938f]">
          {activeSite ? `Delete ${activeSite.hostname} and all its indexed data permanently.` : "Delete all data across all websites."}
        </p>
        <button className="rounded-full border border-red-200 px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50">
          {activeSite ? `Delete ${activeSite.hostname}` : "Delete all data"}
        </button>
      </div>
    </div>
  );
}
