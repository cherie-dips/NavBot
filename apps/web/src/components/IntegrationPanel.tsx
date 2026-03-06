interface IntegrationPanelProps {
  info: {
    siteId: string;
    url: string;
    consoleCode: string;
    scriptTag: string;
  };
}

export const IntegrationPanel = ({ info }: IntegrationPanelProps) => {
  return (
    <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-100 shadow-lg shadow-[#8691CA]/10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-medium text-[#478EDB] uppercase tracking-wide mb-1">
            Integration ready
          </p>
          <h2 className="font-serif text-xl font-light text-[#2E3538]">
            Embed NavBot on <span className="font-medium">{info.url}</span>
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Site ID:{" "}
          <span className="font-mono text-slate-700">{info.siteId}</span>
        </p>
      </div>

      <div className="flex flex-col gap-6 mt-6">
        {/* Console snippet */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-600">
            JavaScript (console)
          </span>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] text-slate-800 font-mono whitespace-pre-wrap break-words select-all">
            {info.consoleCode}
          </div>
        </div>

        {/* HTML snippet */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-600">HTML</span>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] text-slate-800 font-mono whitespace-pre-wrap break-words select-all">
            {info.scriptTag}
          </div>
        </div>
      </div>
    </div>
  );
};
