import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  ChevronDown, ChevronRight, Plus, RefreshCw, Play, SkipBack, SkipForward,
  ChevronsLeft, ChevronsRight, X, Settings, Bell, User, CreditCard, Monitor,
  FolderOpen, Film, Image, Layers, HelpCircle, ChevronUp, Eye, CloudUpload,
  Trash2, Pencil, Copy, Download, Upload, Check, HardDrive, FilePlus2,
  LogOut, ExternalLink, Globe, Maximize2, ZoomIn, ZoomOut, Pause, Info, Minus
} from "lucide-react";
import { ThemeSwitcher } from "./pixell-theme";
import {
  QueueItem, ModelSettings, EventLog, SourceFile, PresetItem, PresetExportSettings, FolderNode,
  defaultModelSettings, defaultPresetExportSettings, buildModelSettingsFromLegacy, formatModelLabel,
  initialQueueData, initialEventLogs, folderTree, sourceFilesByFolder,
  modelTooltipInfo, initialPresets, makeDefaultQueueItem,
  UpscalerLevel, UPSCALER_OPTIONS, getModelUpscaleFactor
} from "./pixell-data";

/* ============================================================
   STYLE HELPERS
   ============================================================ */
const v = (name: string) => `var(--px-${name})`;
const sty = {
  bg0: { background: v("bg-0") }, bg1: { background: v("bg-1") }, bg2: { background: v("bg-2") },
  bg3: { background: v("bg-3") }, bg4: { background: v("bg-4") }, bgHover: { background: v("bg-hover") },
  border: { borderColor: v("border") }, borderLt: { borderColor: v("border-lt") },
  text1: { color: v("text-1") }, text2: { color: v("text-2") }, text3: { color: v("text-3") },
  accent: { color: v("accent") }, accentBg: { background: v("accent"), color: v("bg-1") },
};

type ExrLayerOption = { name: string; selectable: boolean; reason?: string };
type PreviewViewMode = "dual" | "split" | "toggle";
type PreviewSide = "before" | "after";

const EXR_SINGLE_LAYER_OPTIONS: ExrLayerOption[] = [{ name: "RGBA", selectable: true }];
const EXR_MULTI_LAYER_OPTIONS: ExrLayerOption[] = [
  { name: "Beauty", selectable: true },
  { name: "RGBA", selectable: true },
  { name: "Diffuse", selectable: true },
  { name: "Specular", selectable: true },
  { name: "Depth", selectable: false, reason: "No RGBA channel" },
  { name: "MotionVector", selectable: false, reason: "No RGBA channel" },
];

function getExrLayerOptions(item: Pick<QueueItem, "type" | "layerMode">): ExrLayerOption[] {
  if (item.type !== "exr") return [];
  return item.layerMode === "Single" ? EXR_SINGLE_LAYER_OPTIONS : EXR_MULTI_LAYER_OPTIONS;
}

function getDefaultSelectedExrLayers(item: Pick<QueueItem, "type" | "layerMode" | "selectedLayers">): string[] {
  const options = getExrLayerOptions(item);
  const selectable = new Set(options.filter((opt) => opt.selectable).map((opt) => opt.name));
  const seeded = (item.selectedLayers || []).filter((name) => selectable.has(name));
  if (seeded.length > 0) return seeded;
  return options.filter((opt) => opt.selectable).map((opt) => opt.name);
}

/* ============================================================
   SHARED UI COMPONENTS
   ============================================================ */
function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; color: string }> = {
    ready: { bg: v("bg-4"), color: v("text-1") }, standby: { bg: v("bg-4"), color: v("text-2") },
    processing: { bg: v("info"), color: "#fff" }, done: { bg: v("success"), color: "#fff" },
    failed: { bg: v("error"), color: "#fff" }, active: { bg: v("success"), color: "#fff" },
    paused: { bg: v("warning"), color: "#111" }, applying: { bg: v("accent"), color: v("bg-1") }, error: { bg: v("error"), color: "#fff" },
  };
  const c = colorMap[status] || colorMap.ready;
  const labelMap: Record<string, string> = { ready: "Ready", standby: "Standby", processing: "Processing", done: "Done", failed: "Failed", active: "Active", paused: "Paused", applying: "Applying", error: "Error" };
  return <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ background: c.bg, color: c.color }}>{labelMap[status] || status}</span>;
}

function ProgressBar({ value, status }: { value: number; status?: string }) {
  const color = status === "done" ? v("success") : status === "failed" ? v("error") : v("accent");
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: v("border") }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-[10px] min-w-[30px] text-right" style={sty.text2}>{value}%</span>
    </div>
  );
}

function Toggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative w-8 h-4 rounded-full transition-colors cursor-pointer shrink-0"
      style={{ background: active ? v("accent") : v("border") }}>
      <span className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
        style={{ background: active ? v("bg-1") : v("text-2"), left: active ? "17px" : "2px" }} />
    </button>
  );
}

function SparkBars({ values, colorClass }: { values: number[]; colorClass?: string }) {
  if (!values?.length) return null;
  const max = Math.max(...values, 1);
  const barColor = colorClass === "motion" ? v("warning") : colorClass === "audio-l" ? v("success") : colorClass === "audio-r" ? v("info") : v("accent");
  return (
    <div className="h-10 flex items-end gap-px rounded p-1" style={{ background: v("bg-0"), border: `1px solid ${v("border")}` }}>
      {values.map((val, i) => (
        <span key={i} className="flex-1 min-w-[2px] rounded-t-sm"
          style={{ height: `${Math.max(10, Math.round((val / max) * 100))}%`, background: barColor, opacity: 0.85 }} />
      ))}
    </div>
  );
}

function AudioSpectrum({ meta }: { meta: QueueItem["audioMeta"] | null }) {
  if (!meta?.spectrumL?.length) return null;
  const values: { v: number; cls: string }[] = [];
  for (let i = 0; i < meta.spectrumL.length; i++) {
    values.push({ v: meta.spectrumL[i], cls: "audio-l" });
    values.push({ v: meta.spectrumR[i] ?? meta.spectrumL[i], cls: "audio-r" });
  }
  const max = Math.max(...values.map((x) => x.v), 1);
  return (
    <div className="h-10 flex items-end gap-px rounded p-1" style={{ background: v("bg-0"), border: `1px solid ${v("border")}` }}>
      {values.map((x, i) => (
        <span key={i} className="flex-1 min-w-[2px] rounded-t-sm"
          style={{ height: `${Math.max(10, Math.round((x.v / max) * 100))}%`, background: x.cls === "audio-l" ? v("success") : v("info"), opacity: 0.85 }} />
      ))}
    </div>
  );
}

function Modal({ open, onClose, title, children, size = "md" }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: "sm" | "md" | "lg";
}) {
  if (!open) return null;
  const maxW = size === "lg" ? "max-w-[900px]" : size === "sm" ? "max-w-[400px]" : "max-w-[700px]";
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.65)" }} onClick={onClose}>
      <div className={`${maxW} w-[90%] max-h-[85vh] overflow-y-auto rounded-lg p-5 shadow-2xl`} style={{ background: v("bg-2") }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 mb-4" style={{ borderBottom: `1px solid ${v("border")}` }}>
          <span className="text-[15px]" style={{ ...sty.text1, fontWeight: 600 }}>{title}</span>
          <button onClick={onClose} className="cursor-pointer p-1 rounded hover:opacity-70" style={sty.text2}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PreviewSideBadge({ side, active = true, align = "left" }: { side: PreviewSide; active?: boolean; align?: "left" | "right" }) {
  const isBefore = side === "before";
  const color = isBefore ? v("text-2") : v("success");
  return (
    <div
      className={`absolute top-2 ${align === "left" ? "left-2" : "right-2"} px-1.5 py-0.5 rounded text-[9px] z-10`}
      style={{
        background: active ? "rgba(0,0,0,0.62)" : "rgba(0,0,0,0.34)",
        color,
        opacity: active ? 1 : 0.62,
        border: `1px solid ${active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
      }}
    >
      {isBefore ? "Before (Original)" : "After (Enhanced)"}
    </div>
  );
}

function PreviewModeIcon({ mode, active }: { mode: PreviewViewMode; active: boolean }) {
  const stroke = active ? v("bg-1") : v("text-2");
  const common = { fill: "none", stroke, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (mode === "dual") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <rect x="1.5" y="2" width="4.25" height="10" rx="1.1" {...common} />
        <rect x="8.25" y="2" width="4.25" height="10" rx="1.1" {...common} />
      </svg>
    );
  }
  if (mode === "split") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <rect x="1.5" y="2" width="11" height="10" rx="1.1" {...common} />
        <line x1="7" y1="2.8" x2="7" y2="11.2" stroke={stroke} strokeWidth="1.2" strokeDasharray="1.6 1.6" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="1.5" y="2" width="11" height="10" rx="1.1" {...common} />
      <path d="M5.2 4.8L8.8 7L5.2 9.2" {...common} />
    </svg>
  );
}

function PreviewModeButton({
  mode,
  active,
  disabled,
  onClick,
}: {
  mode: PreviewViewMode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const labelMap: Record<PreviewViewMode, string> = { dual: "Dual", split: "Split", toggle: "Toggle" };
  return (
    <button
      className="px-2 py-1 rounded-md text-[10px] cursor-pointer inline-flex items-center gap-1.5 transition-colors"
      style={{
        background: active ? v("accent") : v("bg-2"),
        color: active ? v("bg-1") : v("text-2"),
        border: `1px solid ${active ? v("accent") : v("border")}`,
        opacity: disabled ? 0.45 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
      onClick={onClick}
      type="button"
      aria-pressed={active}
      title={`${labelMap[mode]} view`}
    >
      <PreviewModeIcon mode={mode} active={active} />
      <span>{labelMap[mode]}</span>
    </button>
  );
}

type ExportDraft = {
  resizeEnabled: boolean;
  resizeMode: string;
  resolutionPreset: string;
  customWidth: string;
  customHeight: string;
  aspectRatio: string;
  fpsSelect: string;
  scanType: string;
  codecSelect: string;
  containerSelect: string;
  profileSelect: string;
  qualitySelect: string;
  audioCodec: string;
  audioBitrate: string;
  audioChannels: string;
  audioSampleRate: string;
  timecodeMode: string;
  advancedOpen: boolean;
  bitrateMode: string;
  targetBitrate: string;
  maxBitrate: string;
  twoPass: boolean;
  colorSpace: string;
  colorRange: string;
  gopSec: string;
  loudnessTarget: string;
  loudnessLufs: string;
};

type WatchFolderStatus = "standby" | "active" | "paused" | "applying" | "error";
type WatchFolderPhase = "idle" | "detecting" | "queued" | "processing" | "blocked";
type WatchFolderSettings = {
  modelSettings: ModelSettings;
  exportDraft: ExportDraft;
};
type WatchFolderItem = {
  id: string;
  path: string;
  name: string;
  outputPath: string;
  status: WatchFolderStatus;
  detectedFiles: number;
  settings: WatchFolderSettings | null;
  activity: {
    phase: WatchFolderPhase;
    currentFile?: string;
    queuedCount: number;
    processingCount: number;
    completedToday: number;
    lastEvent: string;
    note: string;
  };
  errorReason?: string;
};

function makeDefaultExportDraft(): ExportDraft {
  return {
    resizeEnabled: false,
    resizeMode: "Scale to Fit",
    resolutionPreset: "ai:original",
    customWidth: "3840",
    customHeight: "2160",
    aspectRatio: "Originals",
    fpsSelect: "Original",
    scanType: "Progressive",
    codecSelect: "H.264",
    containerSelect: "MP4",
    profileSelect: "High",
    qualitySelect: "Good",
    audioCodec: "Copy (Original)",
    audioBitrate: "192 kbps",
    audioChannels: "Stereo",
    audioSampleRate: "48 kHz",
    timecodeMode: "Non-drop frame (NDF)",
    advancedOpen: false,
    bitrateMode: "VBR",
    targetBitrate: "12",
    maxBitrate: "20",
    twoPass: false,
    colorSpace: "Rec.709 (HD)",
    colorRange: "Limited (TV 16-235)",
    gopSec: "Auto",
    loudnessTarget: "Off",
    loudnessLufs: "-23",
  };
}

// ── Export option lists & codec-driven helpers (mirrors PMS SaaS spec) ──
const VIDEO_CODEC_OPTIONS = ["H.264", "H.265 (HEVC)", "VP9", "Apple ProRes", "XAVC 59.94", "XAVC 29.97"];
const RESOLUTION_OPTIONS = ["720x480", "1280x720", "1920x1080", "3840x2160", "7680x4320", "Custom"];

const STANDARD_RESOLUTION_OPTIONS: { value: string; label: string }[] = [
  { value: "640x480",   label: "640x480 (480p SD NTSC)" },
  { value: "768x576",   label: "768x576 (SD PAL)" },
  { value: "1280x720",  label: "1280x720 (720p HD)" },
  { value: "1920x1080", label: "1920x1080 (1080p FHD)" },
  { value: "3840x2160", label: "3840x2160 (2160p 4K)" },
  { value: "7680x4320", label: "7680x4320 (4320p 8K)" },
  { value: "Custom",    label: "Custom" },
];

function parseResStr(res: string): { width: number; height: number } | null {
  const m = res.match(/^\s*(\d+)\s*[xX]\s*(\d+)\s*$/);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

function aiTierForLevel(level: UpscalerLevel): string {
  return level === "off" ? "ai:original" : level === "2x" ? "ai:2x" : "ai:4x";
}

function migrateAiResolutionPreset(current: string, newLevel: UpscalerLevel): string {
  if (!current.startsWith("ai:")) return current; // user override, leave alone
  return aiTierForLevel(newLevel);
}

function buildAiResolutionOptions(level: UpscalerLevel, sourceRes: string | null): { value: string; label: string }[] {
  const parsed = sourceRes ? parseResStr(sourceRes) : null;
  const opts: { value: string; label: string }[] = [];
  opts.push({
    value: "ai:original",
    label: sourceRes ? `${sourceRes} (Original)` : "Source (Original)",
  });
  if (level === "2x") {
    opts.push({
      value: "ai:2x",
      label: parsed ? `${parsed.width * 2}x${parsed.height * 2} (2x AI Upscale)` : "Source × 2 (2x AI Upscale)",
    });
  } else if (level === "4x") {
    opts.push({
      value: "ai:4x",
      label: parsed ? `${parsed.width * 4}x${parsed.height * 4} (4x AI Upscale)` : "Source × 4 (4x AI Upscale)",
    });
  }
  return opts;
}

function resolveResolutionValue(value: string, sourceRes: string | null, customW: string, customH: string): string {
  if (value === "ai:original") return sourceRes ?? "source";
  if (value === "ai:2x" || value === "ai:4x") {
    const parsed = sourceRes ? parseResStr(sourceRes) : null;
    const factor = value === "ai:2x" ? 2 : 4;
    return parsed ? `${parsed.width * factor}x${parsed.height * factor}` : `source × ${factor}`;
  }
  if (value === "Custom") {
    const w = Number(customW); const h = Number(customH);
    return w > 0 && h > 0 ? `${w}x${h}` : "Custom";
  }
  return value;
}

function getResizeOverrideHint(opts: {
  resizeEnabled: boolean;
  resolutionPreset: string;
  aiLevel: UpscalerLevel;
  sourceRes: string | null;
  customW: string;
  customH: string;
}): string | null {
  if (!opts.resizeEnabled) return null;
  if (opts.aiLevel === "off") return null; // no AI to override against
  const aiTier = aiTierForLevel(opts.aiLevel);
  if (opts.resolutionPreset === aiTier) return null; // matches AI plan, no override
  const finalRes = resolveResolutionValue(opts.resolutionPreset, opts.sourceRes, opts.customW, opts.customH);
  const aiLabel = opts.aiLevel === "2x" ? "AI 2x" : "AI 4x";
  return `${aiLabel} → Resize to ${finalRes}`;
}
const FPS_OPTIONS = ["Original", "23.976 fps", "24 fps", "25 fps", "29.97 fps", "30 fps", "50 fps", "59.94 fps", "60 fps"];
const ASPECT_RATIO_OPTIONS = [
  "Originals",
  "Square Pixels (1.0)",
  "DV NTSC (0.9091)",
  "DV NTSC 16:9 (1.2121)",
  "DV PAL (1.0940)",
  "DV PAL 16:9 (1.4587)",
  "Anamorphic 2:1 (2.0)",
  "HD Anamorphic (1.333)",
  "DVCPRO HD (1.5)",
];
const RESIZE_MODE_OPTIONS = ["Scale to Fit", "Stretch to Fill"];
const QUALITY_OPTIONS = ["Low", "Good", "Best"];
const AUDIO_BITRATE_OPTIONS = ["64 kbps", "80 kbps", "96 kbps", "112 kbps", "128 kbps", "160 kbps", "192 kbps", "224 kbps", "256 kbps", "320 kbps"];
const AUDIO_CHANNEL_OPTIONS = ["Mono", "Stereo", "5.1 Surround", "8 ch Discrete (Broadcast)"];
const AUDIO_SAMPLE_RATE_OPTIONS = ["44.1 kHz", "48 kHz", "96 kHz"];
const COLOR_SPACE_OPTIONS = ["Rec.709 (HD)", "Rec.2020 (UHD)", "Rec.601 (SD)", "DCI-P3"];
const COLOR_RANGE_OPTIONS = ["Limited (TV 16-235)", "Full (PC 0-255)"];
const SCAN_TYPE_OPTIONS = ["Progressive", "Interlaced TFF (Top first)", "Interlaced BFF (Bottom first)"];
const GOP_OPTIONS = ["Auto", "0.5 sec", "1 sec", "2 sec", "Closed-GOP 0.5 sec", "All-Intra"];
const LOUDNESS_TARGET_OPTIONS = ["Off", "EBU R128 (-23 LUFS)", "ATSC A/85 (-24 LKFS)", "KOR Broadcast (-24 LKFS)", "Custom"];
const TIMECODE_MODE_OPTIONS = ["Non-drop frame (NDF)", "Drop frame (DF)"];

const isXavcCodec = (codec: string) => codec.startsWith("XAVC");
const isProResCodec = (codec: string) => codec === "Apple ProRes";
const isVP9Codec = (codec: string) => codec === "VP9";

function containersForCodec(codec: string): string[] {
  if (isProResCodec(codec)) return ["MOV"];
  if (isXavcCodec(codec)) return ["MXF"];
  return ["MP4", "MOV", "MKV"]; // TS hidden in Master (HLS-only path)
}

function profilesForCodec(codec: string): string[] {
  if (codec === "H.264") return ["High", "Main"];
  if (codec === "H.265 (HEVC)") return ["Main", "Main10"];
  if (isVP9Codec(codec)) return ["Good (deadline=good)", "Best (deadline=best)"];
  if (isProResCodec(codec)) return ["422 Proxy", "422 LT", "422", "422 HQ", "4444", "4444 XQ"];
  return []; // XAVC: profile not user-selectable (OMX preset)
}

function audioCodecsForCodec(codec: string): string[] {
  if (isXavcCodec(codec)) return ["Copy (Original)"];
  if (isProResCodec(codec)) return ["Copy (Original)", "PCM"];
  if (isVP9Codec(codec)) return ["Copy (Original)", "AAC", "OPUS"];
  return ["Copy (Original)", "AAC"]; // H.264 / H.265
}

function defaultProfileForCodec(codec: string): string {
  const opts = profilesForCodec(codec);
  if (codec === "H.264") return "High";
  if (codec === "H.265 (HEVC)") return "Main";
  if (isVP9Codec(codec)) return "Good (deadline=good)";
  if (isProResCodec(codec)) return "422 HQ";
  return opts[0] || "";
}

function formatWatchExportSummary(draft: ExportDraft) {
  const parts = [draft.codecSelect, draft.containerSelect];
  if (draft.fpsSelect !== "Original") parts.push(draft.fpsSelect);
  if (draft.resizeEnabled) {
    const res = draft.resolutionPreset === "Custom" ? `${draft.customWidth}x${draft.customHeight}` : draft.resolutionPreset;
    parts.push(res);
  }
  return parts.join(" / ");
}

function getWatchActivityLabel(folder: WatchFolderItem) {
  if (folder.status === "error") return folder.errorReason || folder.activity.note;
  if (folder.activity.phase === "processing") return `${folder.activity.currentFile || "Processing task"} in progress`;
  if (folder.activity.phase === "detecting") return `Detecting new files (${folder.detectedFiles} found)`;
  if (folder.activity.phase === "queued") return `${folder.activity.queuedCount} queued`;
  if (folder.activity.phase === "blocked") return folder.activity.note;
  return folder.activity.note;
}

/* ============================================================
   MAIN LAUNCHER
   ============================================================ */
export function PixellLauncher() {
  // ?? State ??
  const [queueData, setQueueData] = useState(() => {
    const data = { ...initialQueueData };
    Object.keys(data).forEach((k) => { data[k] = { ...data[k], modelSettings: buildModelSettingsFromLegacy(data[k]) }; });
    return data;
  });
  const [nextQueueId, setNextQueueId] = useState(4);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [layerSelectionsByQueue, setLayerSelectionsByQueue] = useState<Record<string, string[]>>(() => {
    const seeded: Record<string, string[]> = {};
    Object.entries(initialQueueData).forEach(([qid, item]) => {
      if (item.type !== "exr") return;
      seeded[qid] = getDefaultSelectedExrLayers(item);
    });
    return seeded;
  });
  const [sourceTab, setSourceTab] = useState<"video" | "sequence" | "layer">("video");
  const [centerTab, setCenterTab] = useState<"queue" | "watch">("queue");
  const [queueJobTab, setQueueJobTab] = useState<"video" | "sequence" | "layer">("video");
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [resizeMode, setResizeMode] = useState("Scale to Fit");
  const [resolutionPreset, setResolutionPreset] = useState("ai:original");
  const [customWidth, setCustomWidth] = useState("3840");
  const [customHeight, setCustomHeight] = useState("2160");
  const [aspectRatio, setAspectRatio] = useState("Originals");
  const [fpsSelect, setFpsSelect] = useState("Original");
  const [scanType, setScanType] = useState("Progressive");
  const [codecSelect, setCodecSelect] = useState("H.264");
  const [containerSelect, setContainerSelect] = useState("MP4");
  const [profileSelect, setProfileSelect] = useState("High");
  const [qualitySelect, setQualitySelect] = useState("Good");
  const [bitrateMode, setBitrateMode] = useState("VBR");
  const [targetBitrate, setTargetBitrate] = useState("12");
  const [maxBitrate, setMaxBitrate] = useState("20");
  const [twoPass, setTwoPass] = useState(false);
  const [audioCodec, setAudioCodec] = useState("Copy (Original)");
  const [audioBitrate, setAudioBitrate] = useState("192 kbps");
  const [audioChannels, setAudioChannels] = useState("Stereo");
  const [audioSampleRate, setAudioSampleRate] = useState("48 kHz");
  const [timecodeMode, setTimecodeMode] = useState("Non-drop frame (NDF)");
  const [colorSpace, setColorSpace] = useState("Rec.709 (HD)");
  const [colorRange, setColorRange] = useState("Limited (TV 16-235)");
  const [gopSec, setGopSec] = useState("Auto");
  const [loudnessTarget, setLoudnessTarget] = useState("Off");
  const [loudnessLufs, setLoudnessLufs] = useState("-23");
  const [selectedGpus, setSelectedGpus] = useState<string[]>(["GPU 0: NVIDIA RTX 4090"]);
  const [trimIn, setTrimIn] = useState(0);
  const [trimOut, setTrimOut] = useState(0);

  // Folder & source
  const [selectedFolder, setSelectedFolder] = useState("c-drive");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["c-drive"]));
  const [sourceCheckedIds, setSourceCheckedIds] = useState<Set<string>>(new Set());

  // Drag & drop
  const [dragOverQueue, setDragOverQueue] = useState(false);

  // HW
  const [hwStats, setHwStats] = useState({ cpu: 45, gpu: 78, ram: "12.3", vram: "8.4" });
  const [runtime, setRuntime] = useState({ status: "processing" as string, eta: "00:12:40", enc: 2, proc: 41 });
  const [eventLogs, setEventLogs] = useState<EventLog[]>(initialEventLogs);

  // Modals & menus
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [metadataTargetId, setMetadataTargetId] = useState<string | null>(null);
  const [layerEditQueueId, setLayerEditQueueId] = useState<string | null>(null);
  const [metadataCollapsed, setMetadataCollapsed] = useState<Record<string, boolean>>({});
  const [exportReview, setExportReview] = useState<{ qid: string; trimIn: number; trimOut: number; isPartial: boolean } | null>(null);
  const [exportMetaShowUnchanged, setExportMetaShowUnchanged] = useState<Record<string, boolean>>({});
  const [exportDraft, setExportDraft] = useState<ExportDraft>(makeDefaultExportDraft);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ title: string; desc: string; x: number; y: number } | null>(null);

  // GNB popups
  const [gnbPopup, setGnbPopup] = useState<"credit" | "account" | "settings" | null>(null);
  const [gnbLinkTooltip, setGnbLinkTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [guiLang, setGuiLang] = useState("English");
  const gnbPopupRef = useRef<HTMLDivElement>(null);

  // Preview: timeline & zoom
  const [timelineZoom, setTimelineZoom] = useState(1); // 1 = default, increases with wheel
  const [previewViewMode, setPreviewViewMode] = useState<PreviewViewMode>("toggle");
  const [togglePreviewSide, setTogglePreviewSide] = useState<PreviewSide>("before");
  const [splitPreviewRatio, setSplitPreviewRatio] = useState(0.5);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0.5, y: 0.5 }); // normalized 0..1
  const [playbackTime, setPlaybackTime] = useState(0); // 0..100 percent
  const [isPlaying, setIsPlaying] = useState(false);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const splitDragActiveRef = useRef(false);

  // Panel resize
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [previewHeight, setPreviewHeight] = useState(240);
  const resizingRef = useRef<{ type: string; startX: number; startY: number; startVal: number } | null>(null);

  // Column widths for queue table
  const [colWidths, setColWidths] = useState({ filename: 260, res: 200, duration: 90, info: 56, outputPath: 240 });
  const colResizingRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const trimDragRef = useRef<"in" | "out" | null>(null);

  // Preview images per queue item ??same base image for before/after (before=blurry, after=clear)
  const previewImages: Record<string, { before: string; after: string; thumbs: string[] }> = {
    q0: {
      before: "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=60",
      after: "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80",
      thumbs: [
        "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=40",
        "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=50",
        "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=60",
        "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=70",
      ],
    },
    q1: {
      before: "https://images.unsplash.com/photo-1631768689870-433ccc435658?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=60",
      after: "https://images.unsplash.com/photo-1631768689870-433ccc435658?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80",
      thumbs: [
        "https://images.unsplash.com/photo-1631768689870-433ccc435658?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=40",
        "https://images.unsplash.com/photo-1631768689870-433ccc435658?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=50",
        "https://images.unsplash.com/photo-1631768689870-433ccc435658?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=60",
        "https://images.unsplash.com/photo-1631768689870-433ccc435658?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=70",
      ],
    },
    q2: {
      before: "https://images.unsplash.com/photo-1665846466032-d423b647e84a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=60",
      after: "https://images.unsplash.com/photo-1665846466032-d423b647e84a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80",
      thumbs: [
        "https://images.unsplash.com/photo-1665846466032-d423b647e84a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=40",
        "https://images.unsplash.com/photo-1665846466032-d423b647e84a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=50",
        "https://images.unsplash.com/photo-1665846466032-d423b647e84a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=60",
        "https://images.unsplash.com/photo-1665846466032-d423b647e84a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=70",
      ],
    },
    q3: {
      before: "https://images.unsplash.com/photo-1729025653933-1c0f003d2a23?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=60",
      after: "https://images.unsplash.com/photo-1729025653933-1c0f003d2a23?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80",
      thumbs: [
        "https://images.unsplash.com/photo-1729025653933-1c0f003d2a23?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=40",
        "https://images.unsplash.com/photo-1729025653933-1c0f003d2a23?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=50",
        "https://images.unsplash.com/photo-1729025653933-1c0f003d2a23?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=60",
        "https://images.unsplash.com/photo-1729025653933-1c0f003d2a23?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=70",
      ],
    },
  };
  const defaultPreviewImg = {
    before: "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=60",
    after: "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80",
    thumbs: [
      "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=40",
      "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=50",
      "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=60",
      "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=160&q=70",
    ],
  };
  const curImages = selectedQueueId ? (previewImages[selectedQueueId] || defaultPreviewImg) : defaultPreviewImg;

  // Thumbnail images for queue items
  const queueThumbnails: Record<string, string> = {
    q0: "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=80&q=40",
    q1: "https://images.unsplash.com/photo-1631768689870-433ccc435658?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=80&q=40",
    q2: "https://images.unsplash.com/photo-1665846466032-d423b647e84a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=80&q=40",
    q3: "https://images.unsplash.com/photo-1729025653933-1c0f003d2a23?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=80&q=40",
  };

  // Thumbnail images for source files
  const sourceFileThumbnails: Record<string, string> = {
    sv1: "https://images.unsplash.com/photo-1755967369416-74e0aa25c700?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    sv2: "https://images.unsplash.com/photo-1631768689870-433ccc435658?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    sv3: "https://images.unsplash.com/photo-1665846466032-d423b647e84a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    ss1: "https://images.unsplash.com/photo-1638472358951-1ff43bca22a9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    se1: "https://images.unsplash.com/photo-1542879412-4309c2cade1d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    cv1: "https://images.unsplash.com/photo-1675679609873-77cfbe690f0c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    cv2: "https://images.unsplash.com/photo-1677260304441-e2d8ebb0d4ae?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    cv3: "https://images.unsplash.com/photo-1709316131422-35a5fb1e9eb2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    cv4: "https://images.unsplash.com/photo-1669454571984-ca849eb4d1d6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    cvs1: "https://images.unsplash.com/photo-1675679609873-77cfbe690f0c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    cvs2: "https://images.unsplash.com/photo-1677260304441-e2d8ebb0d4ae?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    cve1: "https://images.unsplash.com/photo-1675679609873-77cfbe690f0c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    cve2: "https://images.unsplash.com/photo-1669454571984-ca849eb4d1d6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    cp1: "https://images.unsplash.com/photo-1638472358951-1ff43bca22a9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    cp2: "https://images.unsplash.com/photo-1542879412-4309c2cade1d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    cp3: "https://images.unsplash.com/photo-1638472358951-1ff43bca22a9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    cs1: "https://images.unsplash.com/photo-1638472358951-1ff43bca22a9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    cs2: "https://images.unsplash.com/photo-1638472358951-1ff43bca22a9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    nv1: "https://images.unsplash.com/photo-1671575584088-03eb2811c30f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    nv2: "https://images.unsplash.com/photo-1671575584088-03eb2811c30f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    ns1: "https://images.unsplash.com/photo-1542879412-4309c2cade1d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    ns2: "https://images.unsplash.com/photo-1671575584088-03eb2811c30f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    ns3: "https://images.unsplash.com/photo-1671575584088-03eb2811c30f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    ne1: "https://images.unsplash.com/photo-1671575584088-03eb2811c30f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    ev1: "https://images.unsplash.com/photo-1764380754282-194c847f6d4c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    ev2: "https://images.unsplash.com/photo-1573790387438-4da905039392?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    ev3: "https://images.unsplash.com/photo-1600267369165-d0581d638a0f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    es1: "https://images.unsplash.com/photo-1542879412-4309c2cade1d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    es2: "https://images.unsplash.com/photo-1764380754282-194c847f6d4c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    ee1: "https://images.unsplash.com/photo-1600267369165-d0581d638a0f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
    ee2: "https://images.unsplash.com/photo-1573790387438-4da905039392?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=60&q=40",
  };

  // Presets
  const [presets, setPresets] = useState<PresetItem[]>(initialPresets);
  const [editingPreset, setEditingPreset] = useState<PresetItem | null>(null);
  const [presetEditOpen, setPresetEditOpen] = useState(false);
  const [watchFolders, setWatchFolders] = useState<WatchFolderItem[]>([
    {
      id: "w1",
      path: "C:\\Watch\\Input",
      name: "Input",
      outputPath: "C:\\Watch\\Output",
      status: "active",
      detectedFiles: 3,
      settings: {
        modelSettings: { upscaler: "2x", edgeEnhancement: false, deinterlace: false },
        exportDraft: { ...makeDefaultExportDraft(), codecSelect: "H.264", containerSelect: "MP4", qualitySelect: "Best", resizeEnabled: true, resolutionPreset: "ai:2x" },
      },
      activity: {
        phase: "processing",
        currentFile: "product_master_001.mov",
        queuedCount: 2,
        processingCount: 1,
        completedToday: 14,
        lastEvent: "Just now",
        note: "Auto-encoding is running after detecting new files.",
      },
    },
    {
      id: "w2",
      path: "D:\\Production\\Raw",
      name: "Raw",
      outputPath: "D:\\Production\\Processed",
      status: "standby",
      detectedFiles: 0,
      settings: null,
      activity: {
        phase: "idle",
        queuedCount: 0,
        processingCount: 0,
        completedToday: 0,
        lastEvent: "Waiting for setup",
        note: "Save settings to enable running immediately.",
      },
    },
    {
      id: "w3",
      path: "J:\\Network\\DailyDrop",
      name: "DailyDrop",
      outputPath: "J:\\Network\\DailyDrop\\out",
      status: "error",
      detectedFiles: 7,
      settings: {
        modelSettings: { upscaler: "off", edgeEnhancement: true, deinterlace: false },
        exportDraft: { ...makeDefaultExportDraft(), codecSelect: "Apple ProRes", containerSelect: "MOV", audioCodec: "PCM" },
      },
      activity: {
        phase: "blocked",
        queuedCount: 4,
        processingCount: 0,
        completedToday: 6,
        lastEvent: "12 min ago",
        note: "Monitoring stopped because the output path is not writable.",
      },
      errorReason: "No write permission for output folder",
    },
    {
      id: "w4",
      path: "E:\\Shoots\\StandbyBatch",
      name: "StandbyBatch",
      outputPath: "E:\\Shoots\\StandbyBatch\\encodes",
      status: "paused",
      detectedFiles: 12,
      settings: {
        modelSettings: { upscaler: "4x", edgeEnhancement: false, deinterlace: true },
        exportDraft: { ...makeDefaultExportDraft(), codecSelect: "H.265 (HEVC)", containerSelect: "MKV", bitrateMode: "CBR", targetBitrate: "24", maxBitrate: "24" },
      },
      activity: {
        phase: "queued",
        queuedCount: 5,
        processingCount: 0,
        completedToday: 9,
        lastEvent: "Paused",
        note: "Press Run again to resume from queued files.",
      },
    },
  ]);
  const [selectedWatchId, setSelectedWatchId] = useState<string | null>("w1");
  const [watchDraftTargetId, setWatchDraftTargetId] = useState<string | null>(null);
  const [watchDraftModelSettings, setWatchDraftModelSettings] = useState<ModelSettings>(defaultModelSettings);
  const [watchDraftExport, setWatchDraftExport] = useState<ExportDraft>(makeDefaultExportDraft);
  const [watchDeleteTargetId, setWatchDeleteTargetId] = useState<string | null>(null);
  const gpuOptions = ["GPU 0: NVIDIA RTX 4090", "GPU 1: NVIDIA RTX 4080"];

  // ?? Derived ??
  const selectedItem = selectedQueueId ? queueData[selectedQueueId] : null;
  const hasSelectedItem = !!selectedItem;
  const hasAfterPreview = selectedItem?.status === "done";
  const checkedCount = checkedIds.size;
  const queueIds = Object.keys(queueData);
  const selectedWatchFolder = selectedWatchId ? watchFolders.find((folder) => folder.id === selectedWatchId) || null : null;
  const sortedWatchFolders = useMemo(() => {
    const priority: Record<WatchFolderStatus, number> = { active: 0, error: 1, paused: 2, standby: 3, applying: 4 };
    return [...watchFolders].sort((a, b) => {
      const statusDiff = priority[a.status] - priority[b.status];
      if (statusDiff !== 0) return statusDiff;
      return a.name.localeCompare(b.name);
    });
  }, [watchFolders]);
  const filteredQueueIds = useMemo(() => {
    return queueIds.filter((qid) => {
      const t = queueData[qid]?.type;
      if (queueJobTab === "video") return t === "video";
      if (queueJobTab === "sequence") return t === "sequence";
      return t === "exr";
    });
  }, [queueData, queueIds, queueJobTab]);

  // File browser ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setExportDraft({
      resizeEnabled,
      resizeMode,
      resolutionPreset,
      customWidth,
      customHeight,
      aspectRatio,
      fpsSelect,
      scanType,
      codecSelect,
      containerSelect,
      profileSelect,
      qualitySelect,
      audioCodec,
      audioBitrate,
      audioChannels,
      audioSampleRate,
      timecodeMode,
      advancedOpen,
      bitrateMode,
      targetBitrate,
      maxBitrate,
      twoPass,
      colorSpace,
      colorRange,
      gopSec,
      loudnessTarget,
      loudnessLufs,
    });
  }, [advancedOpen, aspectRatio, audioBitrate, audioChannels, audioCodec, audioSampleRate, bitrateMode, codecSelect, colorRange, colorSpace, containerSelect, customHeight, customWidth, fpsSelect, gopSec, loudnessLufs, loudnessTarget, maxBitrate, profileSelect, qualitySelect, resizeEnabled, resizeMode, resolutionPreset, scanType, targetBitrate, timecodeMode, twoPass]);

  // Codec-driven cascading: snap invalid options when codec changes + enforce XAVC constraints
  useEffect(() => {
    const containers = containersForCodec(codecSelect);
    if (!containers.includes(containerSelect)) setContainerSelect(containers[0]);
    const profiles = profilesForCodec(codecSelect);
    if (profiles.length > 0 && !profiles.includes(profileSelect)) setProfileSelect(defaultProfileForCodec(codecSelect));
    const audioCodecs = audioCodecsForCodec(codecSelect);
    if (!audioCodecs.includes(audioCodec)) setAudioCodec(audioCodecs[0]);
    if (isXavcCodec(codecSelect)) {
      // XAVC enforces 4K UHD output; force resize on + 3840x2160 + audio Copy
      setResizeEnabled(true);
      setResolutionPreset("3840x2160");
      setAdvancedOpen(false);
    }
    // ProRes: SaaS hides Quality + Advanced areas; default audio is Copy/PCM
    if (isProResCodec(codecSelect)) {
      setAdvancedOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codecSelect]);

  useEffect(() => {
    setPreviewViewMode("dual");
    setTogglePreviewSide("after");
    setSplitPreviewRatio(0.5);
    setPreviewZoom(1);
    setPreviewPan({ x: 0.5, y: 0.5 });
  }, [selectedQueueId, selectedItem?.status]);

  useEffect(() => {
    const stopSplitDrag = () => { splitDragActiveRef.current = false; };
    window.addEventListener("mouseup", stopSplitDrag);
    return () => window.removeEventListener("mouseup", stopSplitDrag);
  }, []);

  useEffect(() => {
    if (!selectedWatchFolder) {
      setWatchDraftTargetId(null);
      return;
    }
    setWatchDraftTargetId(selectedWatchFolder.id);
    setWatchDraftModelSettings(selectedWatchFolder.settings ? JSON.parse(JSON.stringify(selectedWatchFolder.settings.modelSettings)) : defaultModelSettings());
    setWatchDraftExport(selectedWatchFolder.settings ? { ...selectedWatchFolder.settings.exportDraft } : makeDefaultExportDraft());
  }, [selectedWatchFolder]);

  // Source files for selected folder, filtered by tab
  const currentSourceFiles = useMemo(() => {
    const files = sourceFilesByFolder[selectedFolder] || [];
    if (sourceTab === "sequence") return files.filter((f) => f.type === "sequence");
    if (sourceTab === "layer") return files.filter((f) => f.type === "exr");
    return files.filter((f) => f.type === "video");
  }, [selectedFolder, sourceTab]);

  // Count per type for current folder
  const typeCounts = useMemo(() => {
    const files = sourceFilesByFolder[selectedFolder] || [];
    return {
      video: files.filter((f) => f.type === "video").length,
      sequence: files.filter((f) => f.type === "sequence").length,
      layer: files.filter((f) => f.type === "exr").length,
    };
  }, [selectedFolder]);

  // ?? HW ticker ??
  useEffect(() => {
    const timer = setInterval(() => {
      setHwStats({ cpu: 20 + Math.round(Math.random() * 60), gpu: 10 + Math.round(Math.random() * 85), ram: (8 + Math.random() * 20).toFixed(1), vram: (4 + Math.random() * 18).toFixed(1) });
      const statuses = ["processing", "processing", "processing", "idle", "error"];
      setRuntime({
        status: statuses[Math.floor(Math.random() * statuses.length)],
        eta: `00:${String(Math.floor(Math.random() * 18)).padStart(2, "0")}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`,
        enc: 1 + Math.floor(Math.random() * 4), proc: 18 + Math.floor(Math.random() * 54),
      });
      if (Math.random() < 0.15) {
        const levels: EventLog["level"][] = ["INFO", "WARN", "ERROR"];
        const level = levels[Math.floor(Math.random() * levels.length)];
        const now = new Date();
        const t = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
        setEventLogs((prev) => [{ time: t, level, source: level === "ERROR" ? "CLOUD" : "MONITOR", message: { INFO: "Queue status sync completed", WARN: "Encoder buffer delay detected", ERROR: "Cloud export retry required" }[level] }, ...prev].slice(0, 80));
      }
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  // ?? Close GNB popup on click outside ??
  useEffect(() => {
    if (!gnbPopup) return;
    const handler = (e: MouseEvent) => {
      if (gnbPopupRef.current && !gnbPopupRef.current.contains(e.target as Node)) {
        setGnbPopup(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [gnbPopup]);

  const applyWatchSettings = useCallback(() => {
    if (!watchDraftTargetId) return;
    setWatchFolders((prev) => prev.map((folder) => {
      if (folder.id !== watchDraftTargetId) return folder;
      const nextStatus: WatchFolderStatus = folder.status === "paused" ? "paused" : "standby";
      return {
        ...folder,
        status: nextStatus,
        settings: {
          modelSettings: JSON.parse(JSON.stringify(watchDraftModelSettings)),
          exportDraft: { ...watchDraftExport },
        },
        activity: {
          ...folder.activity,
          phase: nextStatus === "paused" ? "queued" : "idle",
          lastEvent: "Settings saved just now",
          note: nextStatus === "paused" ? "Settings saved. Press Run to resume queued files." : "Settings saved. Ready to run.",
        },
        errorReason: undefined,
      };
    }));
    setWatchDraftTargetId(null);
  }, [watchDraftExport, watchDraftModelSettings, watchDraftTargetId]);

  const runWatchFolder = useCallback((watchId: string) => {
    setWatchFolders((prev) => prev.map((folder) => {
      if (folder.id !== watchId) return folder;
      if (!folder.settings) {
        return {
          ...folder,
          status: "error",
          errorReason: "Cannot run without saved settings.",
          activity: {
            ...folder.activity,
            phase: "blocked",
            lastEvent: "Run failed",
            note: "Save watch folder settings in the right panel first.",
          },
        };
      }
      return {
        ...folder,
        status: "active",
        activity: {
          ...folder.activity,
          phase: "processing",
          currentFile: folder.activity.currentFile || `${folder.name.toLowerCase()}_batch_001.mov`,
          queuedCount: Math.max(folder.activity.queuedCount, folder.detectedFiles > 0 ? folder.detectedFiles - 1 : 1),
          processingCount: 1,
          lastEvent: "Started just now",
          note: "Monitoring is active and will process newly detected files with the current settings.",
        },
        errorReason: undefined,
      };
    }));
    setWatchDraftTargetId(null);
  }, []);

  const stopWatchFolder = useCallback((watchId: string) => {
    setWatchFolders((prev) => prev.map((folder) => {
      if (folder.id !== watchId) return folder;
      return {
        ...folder,
        status: "paused",
        activity: {
          ...folder.activity,
          phase: folder.activity.queuedCount > 0 ? "queued" : "idle",
          processingCount: 0,
          lastEvent: "Stopped just now",
          note: folder.activity.queuedCount > 0 ? "Monitoring is stopped. Only queued work remains." : "Monitoring has been stopped.",
        },
      };
    }));
  }, []);

  const deleteWatchFolder = useCallback((watchId: string) => {
    setWatchFolders((prev) => prev.filter((folder) => folder.id !== watchId));
    setWatchDeleteTargetId(null);
    setSelectedWatchId((prev) => {
      if (prev !== watchId) return prev;
      const remaining = watchFolders.filter((folder) => folder.id !== watchId);
      return remaining[0]?.id || null;
    });
  }, [watchFolders]);

  const toggleGpuSelection = useCallback((gpu: string) => {
    setSelectedGpus((prev) => {
      if (prev.includes(gpu)) return prev.filter((item) => item !== gpu);
      if (prev.length >= 2) return prev;
      return [...prev, gpu];
    });
  }, []);

  // ?? Panel resize drag handler ??
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      e.preventDefault();
      const dx = e.clientX - r.startX;
      const dy = e.clientY - r.startY;
      if (r.type === "left") setLeftPanelWidth(Math.max(180, Math.min(500, r.startVal + dx)));
      if (r.type === "right") setRightPanelWidth(Math.max(220, Math.min(520, r.startVal - dx)));
      if (r.type === "preview") setPreviewHeight(Math.max(140, Math.min(500, r.startVal + dy)));
    };
    const handleMouseUp = () => {
      resizingRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => { document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
  }, []);

  // ?? Trim handle drag ??
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!trimDragRef.current || !timelineTrackRef.current) return;
      const rect = timelineTrackRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const raw = ((e.clientX - rect.left) / rect.width) * 100;
      const pct = Math.max(0, Math.min(100, raw));
      if (trimDragRef.current === "in") setTrimIn(Math.min(pct, trimOut));
      if (trimDragRef.current === "out") setTrimOut(Math.max(pct, trimIn));
    };
    const handleMouseUp = () => {
      trimDragRef.current = null;
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [trimIn, trimOut]);

  // ?? Column resize handler ??
  useEffect(() => {
    const handleColMouseMove = (e: MouseEvent) => {
      const r = colResizingRef.current;
      if (!r) return;
      e.preventDefault();
      const dx = e.clientX - r.startX;
      const newWidth = Math.max(60, r.startWidth + dx);
      setColWidths((prev) => ({ ...prev, [r.col]: newWidth }));
    };
    const handleColMouseUp = () => {
      colResizingRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleColMouseMove);
    document.addEventListener("mouseup", handleColMouseUp);
    return () => { document.removeEventListener("mousemove", handleColMouseMove); document.removeEventListener("mouseup", handleColMouseUp); };
  }, []);

  useEffect(() => {
    setLayerSelectionsByQueue((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(queueData).forEach(([qid, item]) => {
        if (item.type !== "exr") return;
        if (!next[qid] || next[qid].length === 0) {
          next[qid] = getDefaultSelectedExrLayers(item);
          changed = true;
          return;
        }
        const selectable = new Set(getExrLayerOptions(item).filter((opt) => opt.selectable).map((opt) => opt.name));
        const filtered = next[qid].filter((name) => selectable.has(name));
        if (filtered.length !== next[qid].length) {
          next[qid] = filtered.length > 0 ? filtered : getDefaultSelectedExrLayers(item);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [queueData]);

  // Migrate the queue panel resolutionPreset when the selected item's AI level changes
  useEffect(() => {
    const lvl = selectedItem?.modelSettings?.upscaler;
    if (!lvl) return;
    setResolutionPreset((curr) => migrateAiResolutionPreset(curr, lvl));
  }, [selectedItem?.modelSettings?.upscaler]);

  // Migrate the watch draft resolutionPreset when its AI level changes
  useEffect(() => {
    setWatchDraftExport((prev) => {
      const next = migrateAiResolutionPreset(prev.resolutionPreset, watchDraftModelSettings.upscaler);
      return next === prev.resolutionPreset ? prev : { ...prev, resolutionPreset: next };
    });
  }, [watchDraftModelSettings.upscaler]);

  const startResize = (type: string, e: React.MouseEvent, startVal: number) => {
    e.preventDefault();
    resizingRef.current = { type, startX: e.clientX, startY: e.clientY, startVal };
    document.body.style.cursor = type === "preview" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
  };

  const startColResize = (col: string, e: React.MouseEvent, startWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    colResizingRef.current = { col, startX: e.clientX, startWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // ?? Handlers ??
  const selectRow = useCallback((qid: string) => {
    setSelectedQueueId(qid);
    const d = queueData[qid];
    if (d) { setTrimIn(0); setTrimOut(100); }
  }, [queueData]);

  const clearSelection = useCallback(() => { setSelectedQueueId(null); setTrimIn(0); setTrimOut(0); }, []);

  const toggleCheck = useCallback((qid: string) => {
    setCheckedIds((prev) => { const next = new Set(prev); if (next.has(qid)) next.delete(qid); else next.add(qid); return next; });
  }, []);

  const toggleLayerSelection = useCallback((qid: string, layer: ExrLayerOption) => {
    if (!layer.selectable) return;
    setLayerSelectionsByQueue((prev) => {
      const current = prev[qid] || [];
      const nextLayers = current.includes(layer.name)
        ? current.filter((name) => name !== layer.name)
        : [...current, layer.name];
      setQueueData((queuePrev) => {
        const item = queuePrev[qid];
        if (!item) return queuePrev;
        return { ...queuePrev, [qid]: { ...item, selectedLayers: nextLayers } };
      });
      return { ...prev, [qid]: nextLayers };
    });
  }, []);

  const openLayerEditor = useCallback((qid: string) => {
    setLayerEditQueueId(qid);
    setModalOpen("layerEditor");
  }, []);

  const toggleAll = useCallback((checked: boolean) => { setCheckedIds(checked ? new Set(filteredQueueIds) : new Set()); }, [filteredQueueIds]);

  function getAppliedModelNames(item: QueueItem): string[] {
    const cfg = item.modelSettings;
    if (!cfg) return [];
    const names: string[] = [];
    if (cfg.upscaler === "2x") names.push("2x Upscale");
    else if (cfg.upscaler === "4x") names.push("4x Upscale");
    if (cfg.edgeEnhancement) names.push("Edge Enhancement");
    if (cfg.deinterlace) names.push("De-interlace");
    return names;
  }

  function parseFrameRange(name: string): string {
    const m = name.match(/\[(\d+)-(\d+)\]/);
    if (!m) return "-";
    return `${m[1]}-${m[2]}`;
  }

  function getDefaultOutputPath(item: QueueItem, overrideDir?: string): string {
    const sourcePath = item.sourcePath || `C:\\Input\\${item.fileName}`;
    const ext = item.fileName.includes(".") ? item.fileName.split(".").pop()! : "mp4";
    const baseName = item.fileName.replace(/\.[^.]+$/, "");
    const dir = overrideDir || sourcePath.slice(0, Math.max(0, sourcePath.lastIndexOf("\\")));
    const models = getAppliedModelNames(item);
    const suffix = models.length > 0 ? `_${models.join(",")}` : "_NoModel";
    return `${dir}\\${baseName}${suffix}.${ext}`;
  }

  function toSeconds(duration: string): number | null {
    const m = duration.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }

  function toDuration(seconds: number): string {
    const sec = Math.max(0, Math.round(seconds));
    const hh = String(Math.floor(sec / 3600)).padStart(2, "0");
    const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  const toggleDeinterlace = useCallback((qid: string) => {
    setQueueData((prev) => {
      const next = { ...prev }; const item = { ...next[qid] };
      if (!item.modelSettings) return prev;
      item.modelSettings = { ...item.modelSettings, deinterlace: !item.modelSettings.deinterlace };
      item.outputPath = getDefaultOutputPath(item);
      next[qid] = item; return next;
    });
  }, [getDefaultOutputPath]);

  const setUpscaler = useCallback((qid: string, level: UpscalerLevel) => {
    setQueueData((prev) => {
      const next = { ...prev }; const item = { ...next[qid] };
      if (!item.modelSettings) return prev;
      item.modelSettings = { ...item.modelSettings, upscaler: level };
      item.outputPath = getDefaultOutputPath(item);
      next[qid] = item; return next;
    });
  }, [getDefaultOutputPath]);

  const toggleEdgeEnhancement = useCallback((qid: string) => {
    setQueueData((prev) => {
      const next = { ...prev }; const item = { ...next[qid] };
      if (!item.modelSettings) return prev;
      item.modelSettings = { ...item.modelSettings, edgeEnhancement: !item.modelSettings.edgeEnhancement };
      item.outputPath = getDefaultOutputPath(item);
      next[qid] = item; return next;
    });
  }, [getDefaultOutputPath]);

  const duplicateQueueItem = useCallback((qid: string) => {
    setQueueData((prev) => {
      const src = prev[qid];
      if (!src) return prev;
      const newId = `q${nextQueueId}`;
      const clone: QueueItem = {
        ...src,
        status: "ready",
        progress: undefined,
        modelSettings: src.modelSettings ? JSON.parse(JSON.stringify(src.modelSettings)) : undefined,
      };
      setNextQueueId((n) => n + 1);
      return { ...prev, [newId]: clone };
    });
  }, [nextQueueId]);

  const addToQueue = useCallback((sourceFiles: SourceFile[]) => {
    if (!sourceFiles.length) return;
    setQueueData((prev) => {
      const next = { ...prev };
      let id = nextQueueId;
      sourceFiles.forEach((sf) => {
        const qid = `q${id++}`;
        const item = makeDefaultQueueItem(sf);
        item.modelSettings = buildModelSettingsFromLegacy(item);
        next[qid] = item;
      });
      setNextQueueId(id);
      return next;
    });
  }, [nextQueueId]);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => { const next = new Set(prev); if (next.has(folderId)) next.delete(folderId); else next.add(folderId); return next; });
  }, []);

  const selectFolder = useCallback((folderId: string) => {
    setSelectedFolder(folderId);
    setSourceCheckedIds(new Set());
  }, []);

  const getOutputRes = useCallback((inputRes: string) => {
    if (!resizeEnabled) return inputRes;
    if (resolutionPreset === "Custom") { const w = Number(customWidth); const h = Number(customHeight); if (w > 0 && h > 0) return `${w}x${h}`; return inputRes; }
    if (resolutionPreset === "ai:original") return inputRes;
    if (resolutionPreset === "ai:2x" || resolutionPreset === "ai:4x") {
      const parsed = inputRes.match(/^\s*(\d+)\s*[xX]\s*(\d+)\s*$/);
      const factor = resolutionPreset === "ai:2x" ? 2 : 4;
      return parsed ? `${Number(parsed[1]) * factor}x${Number(parsed[2]) * factor}` : inputRes;
    }
    return resolutionPreset || inputRes;
  }, [resizeEnabled, resolutionPreset, customWidth, customHeight]);

  const getOutputFps = useCallback((inputFps: string) => fpsSelect === "Original" ? inputFps : fpsSelect.replace(" fps", ""), [fpsSelect]);

  const parseResolution = useCallback((res: string): { width: number; height: number } | null => {
    const match = res.match(/^\s*(\d+)\s*[xX]\s*(\d+)\s*$/);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
  }, []);

  const getUpscaledResolution = useCallback((item: QueueItem): string => {
    const parsed = parseResolution(item.res);
    if (!parsed) return item.res;
    const factor = item.modelSettings ? getModelUpscaleFactor(item.modelSettings.upscaler) : 1;
    if (factor === 1) return item.res;
    return `${parsed.width * factor}x${parsed.height * factor}`;
  }, [parseResolution]);

  const getQueueAfterResolution = useCallback((item: QueueItem): string => {
    return getUpscaledResolution(item);
  }, [getUpscaledResolution]);

  const getDraftOutputRes = useCallback((item: QueueItem, draft: ExportDraft): string => {
    const parsed = parseResolution(item.res);
    const factor = item.modelSettings ? getModelUpscaleFactor(item.modelSettings.upscaler) : 1;
    if (!draft.resizeEnabled) {
      if (factor > 1 && parsed) return `${parsed.width * factor}x${parsed.height * factor}`;
      return item.res;
    }
    if (draft.resolutionPreset === "ai:original") return item.res;
    if ((draft.resolutionPreset === "ai:2x" || draft.resolutionPreset === "ai:4x") && parsed) {
      const f = draft.resolutionPreset === "ai:2x" ? 2 : 4;
      return `${parsed.width * f}x${parsed.height * f}`;
    }
    if (draft.resolutionPreset === "Custom") {
      const w = Number(draft.customWidth);
      const h = Number(draft.customHeight);
      if (w > 0 && h > 0) return `${w}x${h}`;
      return item.res;
    }
    return draft.resolutionPreset || item.res;
  }, [parseResolution]);

  const getDraftOutputFps = useCallback((inputFps: string, draft: ExportDraft) => {
    return draft.fpsSelect === "Original" ? inputFps : draft.fpsSelect.replace(" fps", "");
  }, []);

  const buildExportReviewRows = useCallback((item: QueueItem, draft: ExportDraft, trimInfo?: { isPartial: boolean; trimIn: number; trimOut: number }) => {
    const afterResolution = getDraftOutputRes(item, draft);
    const afterFps = getDraftOutputFps(item.fps, draft);
    const afterDuration = trimInfo?.isPartial
      ? (() => {
          const fullSec = toSeconds(item.duration);
          if (fullSec == null) return item.duration;
          return toDuration(fullSec * ((trimInfo.trimOut - trimInfo.trimIn) / 100));
        })()
      : item.duration;
    const afterCodec = draft.codecSelect;
    const afterContainer = draft.containerSelect;
    const afterQuality = draft.containerSelect === "MOV" ? "-" : draft.qualitySelect;
    const afterBitrateMode = draft.advancedOpen ? draft.bitrateMode : "-";
    const afterBitrate = draft.advancedOpen ? `${draft.targetBitrate} Mbps (max ${draft.maxBitrate})` : item.bitrate;
    const afterAudioCodec = draft.audioCodec.startsWith("Copy") ? item.codec : draft.audioCodec;

    return [
      { section: "Video Info", item: "File Name", before: item.fileName, after: item.fileName },
      { section: "Video Info", item: "Resolution", before: item.res, after: afterResolution },
      { section: "Video Info", item: "Duration", before: item.duration, after: afterDuration },
      { section: "Video Info", item: "Codec", before: item.codec, after: afterCodec },
      { section: "Video Info", item: "Container", before: item.container, after: afterContainer },
      { section: "Video Info", item: "Quality", before: "-", after: afterQuality },
      { section: "Video Info", item: "Bitrate Mode", before: "-", after: afterBitrateMode },
      { section: "Video Info", item: "Bitrate", before: item.bitrate, after: afterBitrate },
      { section: "Video Info", item: "FPS", before: item.fps, after: afterFps },
      { section: "Video Info", item: "Timecode", before: item.timecode, after: item.timecode },
      { section: "Color Info", item: "Color Space", before: item.color, after: item.color },
      { section: "Color Info", item: "Bit Depth", before: item.colorMeta.bitDepth, after: item.colorMeta.bitDepth },
      { section: "Color Info", item: "Color Primaries", before: item.colorMeta.primaries, after: item.colorMeta.primaries },
      { section: "Audio Info", item: "Audio Codec", before: item.codec, after: afterAudioCodec },
      { section: "Audio Info", item: "Sample Rate", before: item.audioMeta.sampleRate, after: item.audioMeta.sampleRate },
      { section: "Audio Info", item: "Channels", before: item.audioMeta.channels, after: item.audioMeta.channels },
    ].map((row) => ({ ...row, changed: row.before !== row.after }));
  }, [getDraftOutputFps, getDraftOutputRes, toDuration, toSeconds]);

  const buildQueueMetadataRows = useCallback((item: QueueItem) => {
    const done = item.status === "done";
    const afterResolution = getQueueAfterResolution(item);
    const afterFps = getOutputFps(item.fps);
    const afterCodec = codecSelect;
    const afterContainer = containerSelect;
    const afterAudioCodec = audioCodec.startsWith("Copy") ? item.codec : audioCodec;

    return [
      { section: "Video Info", item: "File Name", before: item.fileName, after: done ? item.fileName : "-" },
      { section: "Video Info", item: "Resolution", before: item.res, after: done ? afterResolution : "-" },
      { section: "Video Info", item: "Duration", before: item.duration, after: done ? item.duration : "-" },
      { section: "Video Info", item: "Codec", before: item.codec, after: done ? afterCodec : "-" },
      { section: "Video Info", item: "Container", before: item.container, after: done ? afterContainer : "-" },
      { section: "Video Info", item: "Bitrate", before: item.bitrate, after: done ? item.bitrate : "-" },
      { section: "Video Info", item: "FPS", before: item.fps, after: done ? afterFps : "-" },
      { section: "Video Info", item: "File Size", before: item.size, after: done ? item.size : "-" },
      { section: "Video Info", item: "Timecode", before: item.timecode, after: done ? item.timecode : "-" },
      { section: "Video Info", item: "Scan Type", before: item.scan, after: done ? item.scan : "-" },
      { section: "Color Info", item: "Color Space", before: item.color, after: done ? item.color : "-" },
      { section: "Color Info", item: "Bit Depth", before: item.colorMeta.bitDepth, after: done ? item.colorMeta.bitDepth : "-" },
      { section: "Color Info", item: "Chroma Subsampling", before: item.colorMeta.chroma, after: done ? item.colorMeta.chroma : "-" },
      { section: "Color Info", item: "Color Primaries", before: item.colorMeta.primaries, after: done ? item.colorMeta.primaries : "-" },
      { section: "Color Info", item: "Transfer Characteristics", before: item.colorMeta.transfer, after: done ? item.colorMeta.transfer : "-" },
      { section: "Color Info", item: "Matrix Coefficients", before: item.colorMeta.matrix, after: done ? item.colorMeta.matrix : "-" },
      { section: "Color Info", item: "Mastering (SDR/HDR)", before: item.colorMeta.mastering, after: done ? item.colorMeta.mastering : "-" },
      { section: "Audio Info", item: "Audio Codec", before: item.codec, after: done ? afterAudioCodec : "-" },
      { section: "Audio Info", item: "Audio Track", before: item.audioMeta.channels, after: done ? item.audioMeta.channels : "-" },
      { section: "Audio Info", item: "Sample Rate", before: item.audioMeta.sampleRate, after: done ? item.audioMeta.sampleRate : "-" },
    ];
  }, [audioCodec, codecSelect, containerSelect, getOutputFps, getQueueAfterResolution]);

  const pctToTime = (pct: number) => {
    const sec = Math.round(10 * (pct / 100));
    return `${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  };

  const chooseOutputPath = useCallback(async (qid: string) => {
    const item = queueData[qid];
    if (!item) return;
    const fallback = getDefaultOutputPath(item);
    try {
      const w = window as any;
      if (w.showSaveFilePicker) {
        const suggestedName = fallback.slice(fallback.lastIndexOf("\\") + 1);
        const handle = await w.showSaveFilePicker({ suggestedName });
        setQueueData((prev) => ({ ...prev, [qid]: { ...prev[qid], outputPath: `${fallback.slice(0, fallback.lastIndexOf("\\"))}\\${handle.name}` } }));
        return;
      }
    } catch {
      return;
    }
    const manual = window.prompt("Enter output path", fallback);
    if (manual && manual.trim()) {
      setQueueData((prev) => ({ ...prev, [qid]: { ...prev[qid], outputPath: manual.trim() } }));
    }
  }, [queueData]);

  const openExportReview = useCallback((qid: string) => {
    const src = queueData[qid];
    if (!src) return;
    const isPartial = trimIn > 0 || trimOut < 100;
    setExportMetaShowUnchanged({});
    setExportDraft({
      resizeEnabled,
      resizeMode,
      resolutionPreset,
      customWidth,
      customHeight,
      aspectRatio,
      fpsSelect,
      scanType,
      codecSelect,
      containerSelect,
      profileSelect,
      qualitySelect,
      audioCodec,
      audioBitrate,
      audioChannels,
      audioSampleRate,
      timecodeMode,
      advancedOpen,
      bitrateMode,
      targetBitrate,
      maxBitrate,
      twoPass,
      colorSpace,
      colorRange,
      gopSec,
      loudnessTarget,
      loudnessLufs,
    });
    setExportReview({ qid, trimIn, trimOut, isPartial });
    setModalOpen("exportReview");
  }, [advancedOpen, aspectRatio, audioBitrate, audioChannels, audioCodec, audioSampleRate, bitrateMode, codecSelect, colorRange, colorSpace, containerSelect, customHeight, customWidth, fpsSelect, gopSec, loudnessLufs, loudnessTarget, maxBitrate, profileSelect, qualitySelect, queueData, resizeEnabled, resizeMode, resolutionPreset, scanType, targetBitrate, timecodeMode, trimIn, trimOut, twoPass]);

  const performExportStart = useCallback(() => {
    if (!exportReview) return;
    const src = queueData[exportReview.qid];
    if (!src) return;

    setResizeEnabled(exportDraft.resizeEnabled);
    setResizeMode(exportDraft.resizeMode);
    setResolutionPreset(exportDraft.resolutionPreset);
    setCustomWidth(exportDraft.customWidth);
    setCustomHeight(exportDraft.customHeight);
    setAspectRatio(exportDraft.aspectRatio);
    setFpsSelect(exportDraft.fpsSelect);
    setScanType(exportDraft.scanType);
    setCodecSelect(exportDraft.codecSelect);
    setContainerSelect(exportDraft.containerSelect);
    setProfileSelect(exportDraft.profileSelect);
    setQualitySelect(exportDraft.qualitySelect);
    setAudioCodec(exportDraft.audioCodec);
    setAudioBitrate(exportDraft.audioBitrate);
    setAudioChannels(exportDraft.audioChannels);
    setAudioSampleRate(exportDraft.audioSampleRate);
    setTimecodeMode(exportDraft.timecodeMode);
    setAdvancedOpen(exportDraft.advancedOpen);
    setBitrateMode(exportDraft.bitrateMode);
    setTargetBitrate(exportDraft.targetBitrate);
    setMaxBitrate(exportDraft.maxBitrate);
    setTwoPass(exportDraft.twoPass);
    setColorSpace(exportDraft.colorSpace);
    setColorRange(exportDraft.colorRange);
    setGopSec(exportDraft.gopSec);
    setLoudnessTarget(exportDraft.loudnessTarget);
    setLoudnessLufs(exportDraft.loudnessLufs);

    if (exportReview.isPartial) {
      const fullSec = toSeconds(src.duration);
      const clippedDuration = fullSec == null ? src.duration : toDuration(fullSec * ((exportReview.trimOut - exportReview.trimIn) / 100));
      const ext = src.fileName.includes(".") ? src.fileName.split(".").pop()! : "mp4";
      const baseName = src.fileName.replace(/\.[^.]+$/, "");
      const clipName = `${baseName}_clip_${pctToTime(exportReview.trimIn).replaceAll(":", "")}-${pctToTime(exportReview.trimOut).replaceAll(":", "")}.${ext}`;

      setQueueData((prev) => {
        const newId = `q${nextQueueId}`;
        const clone: QueueItem = {
          ...prev[exportReview.qid],
          fileName: clipName,
          duration: clippedDuration,
          status: "processing",
          progress: 0,
          codec: exportDraft.codecSelect,
          container: exportDraft.containerSelect,
          fps: getDraftOutputFps(src.fps, exportDraft),
        };
        clone.outputPath = getDefaultOutputPath(clone);
        setNextQueueId((n) => n + 1);
        return { ...prev, [newId]: clone };
      });
    } else {
      setQueueData((prev) => ({
        ...prev,
        [exportReview.qid]: {
          ...prev[exportReview.qid],
          status: "processing",
          progress: 0,
          codec: exportDraft.codecSelect,
          container: exportDraft.containerSelect,
          fps: getDraftOutputFps(src.fps, exportDraft),
        },
      }));
    }

    setModalOpen(null);
    setExportReview(null);
  }, [exportDraft, exportReview, getDefaultOutputPath, getDraftOutputFps, nextQueueId, pctToTime, queueData, toDuration, toSeconds]);

  const runtimeSignalColor = runtime.status === "processing" ? v("success") : runtime.status === "error" ? v("error") : v("warning");
  const runtimeLabel = runtime.status === "processing" ? "Processing" : runtime.status === "error" ? "Error" : "Standby";

  // ?? Drag handlers for source files ??
  const handleSourceDragStart = useCallback((e: React.DragEvent, files: SourceFile[]) => {
    e.dataTransfer.setData("application/json", JSON.stringify(files));
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const handleQueueDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOverQueue(true);
  }, []);

  const handleQueueDragLeave = useCallback(() => { setDragOverQueue(false); }, []);

  const handleQueueDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverQueue(false);
    try {
      const data = e.dataTransfer.getData("application/json");
      if (data) { const files: SourceFile[] = JSON.parse(data); addToQueue(files); }
    } catch {}
  }, [addToQueue]);

  // ?? File browser add ??
  const handleFileBrowserAdd = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const supportedExts = new Set(["mp4", "mov", "mxf", "ts", "jpg", "png", "bmp", "exr", "tif", "tiff", "dpx"]);
    const newFiles: SourceFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!supportedExts.has(ext)) continue;
      const isSeq = ["tif", "tiff", "dpx"].includes(ext);
      const isExr = ext === "exr";
      const type: "video" | "sequence" | "exr" = isExr ? "exr" : isSeq ? "sequence" : "video";
      newFiles.push({
        id: `fb_${Date.now()}_${i}`,
        name: file.name,
        res: "Unknown",
        fps: type === "video" ? "Unknown" : undefined,
        duration: type === "video" ? "00:00:00" : undefined,
        frames: type !== "video" ? "0" : undefined,
        type,
        folder: selectedFolder,
      });
    }
    if (newFiles.length > 0) addToQueue(newFiles);
    e.target.value = "";
  }, [addToQueue, selectedFolder]);

  // ?? Preset CRUD ??
  const generateUniqueName = useCallback((baseName: string, existingPresets: PresetItem[]) => {
    const names = new Set(existingPresets.map((p) => p.name));
    let candidate = `${baseName} (Copy)`;
    let idx = 2;
    while (names.has(candidate)) { candidate = `${baseName} (Copy ${idx})`; idx++; }
    return candidate;
  }, []);

  const handleAddPreset = useCallback(() => {
    const names = new Set(presets.map((p) => p.name));
    let name = "New Preset";
    let idx = 2;
    while (names.has(name)) { name = `New Preset ${idx}`; idx++; }
    const newPreset: PresetItem = {
      id: `p${Date.now()}`,
      name,
      modelSettings: defaultModelSettings(),
      exportSettings: defaultPresetExportSettings(),
    };
    setPresets((prev) => [...prev, newPreset]);
    setEditingPreset(newPreset);
    setPresetEditOpen(true);
  }, [presets]);

  const handleUpdatePreset = useCallback(() => {
    if (!editingPreset) return;
    setPresets((prev) => prev.map((p) => p.id === editingPreset.id ? { ...editingPreset } : p));
    setEditingPreset(null);
    setPresetEditOpen(false);
  }, [editingPreset]);

  const handleDeletePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleDuplicatePreset = useCallback((preset: PresetItem, afterId: string) => {
    setPresets((prev) => {
      const newName = generateUniqueName(preset.name, prev);
      const newPreset: PresetItem = {
        ...JSON.parse(JSON.stringify(preset)),
        id: `p${Date.now()}`,
        name: newName,
      };
      const idx = prev.findIndex((p) => p.id === afterId);
      const next = [...prev];
      next.splice(idx + 1, 0, newPreset);
      return next;
    });
  }, [generateUniqueName]);

  /* ============================================================
     RENDER: GNB
     ============================================================ */
  const menus = [
    { label: "File", items: [{ label: "Add File", shortcut: "Ctrl+I" }, { label: "Add Folder", shortcut: "Ctrl+Shift+I" }, { divider: true }, { label: "Start Queue", shortcut: "Ctrl+P" }, { label: "Cancel Queue", shortcut: "Ctrl+Shift+." }, { divider: true }, { label: "Exit", shortcut: "Alt+F4" }] },
    { label: "Edit", items: [
      { label: "Undo", shortcut: "Ctrl+Z" },
      { label: "Redo", shortcut: "Ctrl+Y" },
      { divider: true },
      { label: "Cut", shortcut: "Ctrl+X" },
      { label: "Copy", shortcut: "Ctrl+C" },
      { label: "Paste", shortcut: "Ctrl+V" },
      { label: "Delete", shortcut: "Del" },
      { divider: true },
      { label: "Duplicate", shortcut: "Ctrl+D" },
      { divider: true },
      { label: "Select All", shortcut: "Ctrl+A" },
      { label: "Deselect All", shortcut: "Ctrl+Shift+A" },
      { divider: true },
      { label: "Export Settings", shortcut: "Ctrl+," },
    ] },
    { label: "View", items: [
      { label: "Move Backward" },
      { label: isPlaying ? "Pause" : "Play" },
      { label: "Move Forward" },
      { divider: true },
      { label: "Fit" },
      { label: "100%" },
      { label: "200%" },
      { label: "400%" },
      { divider: true },
      { label: "Dual View" },
      { label: "Split View" },
      { label: "Toggle View" },
      { divider: true },
      { label: "Full Screen View", shortcut: "F11" },
    ] },
    { label: "Help", items: [{ label: "Help", shortcut: "F1" }, { label: "Check Updates" }, { divider: true }, { label: "About" }] },
  ];

  const renderGnb = () => (
    <div className="flex select-none shrink-0" style={{ background: v("bg-4"), borderBottom: `1px solid ${v("border")}` }}>
      {menus.map((menu) => (
        <div key={menu.label} className="relative" onMouseEnter={() => setOpenMenu(menu.label)} onMouseLeave={() => setOpenMenu(null)}>
          <div className="px-3 py-1.5 cursor-pointer text-[12px] transition-colors" style={{ color: v("text-1") }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = v("bg-hover"); }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
            {menu.label}
          </div>
          {openMenu === menu.label && (
            <div className="absolute top-full left-0 z-[1000] min-w-[220px] rounded shadow-lg py-1" style={{ background: v("bg-4"), border: `1px solid ${v("border")}` }}>
              {menu.items.map((item, i) =>
                (item as any).divider ? <div key={i} className="my-1 h-px" style={{ background: v("border") }} /> : (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 cursor-pointer text-[11px] transition-colors" style={{ color: v("text-1") }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = v("bg-hover"); }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    <span>{(item as any).label}</span>
                    {(item as any).shortcut && <span className="ml-6 text-[10px]" style={sty.text2}>{(item as any).shortcut}</span>}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  /* ============================================================
     RENDER: TITLE BAR
     ============================================================ */
  const renderTitleBar = () => (
    <div className="flex items-center gap-3 px-4 py-2 shrink-0" style={{ background: v("bg-2"), borderBottom: `1px solid ${v("border")}` }}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded flex items-center justify-center text-[13px]" style={{ background: v("accent"), color: v("bg-1"), fontWeight: 700 }}>P</div>
        <span className="text-[15px]" style={{ color: v("accent"), fontWeight: 700 }}>PIXELL Launcher</span>
      </div>
      <div className="flex-1 flex justify-center">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: runtimeSignalColor, boxShadow: `0 0 6px ${runtimeSignalColor}` }} />
          <span className="text-[11px]" style={sty.text2}>{runtimeLabel}</span>
          {runtime.status === "processing" && <span className="text-[11px]" style={{ color: v("text-1"), fontWeight: 600 }}>ETA {runtime.eta}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-3 text-[10px]">
          {[
            { label: "CPU", val: `${hwStats.cpu}%` },
            { label: "GPU", val: `${hwStats.gpu}%` },
            { label: "RAM", val: `${hwStats.ram}` },
            { label: "VRAM", val: `${hwStats.vram}` }
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center" style={{ minWidth: "38px" }}>
              <span className="text-[9px] leading-tight" style={sty.text3}>{item.label}</span>
              <span className="text-[10px] leading-tight font-medium" style={sty.text1}>{item.val}</span>
            </div>
          ))}
        </div>
        <button className="relative flex items-center gap-1 px-2 py-1 rounded-full cursor-pointer text-[11px]" style={{ background: v("bg-1"), border: `1px solid ${v("border")}`, color: v("text-1") }} onClick={() => setModalOpen("eventLog")}>
          <Bell size={13} />
          <span className="min-w-[16px] h-4 rounded-full flex items-center justify-center px-1 text-[9px]" style={{ background: v("error"), color: "#fff" }}>{eventLogs.length}</span>
        </button>
        {/* GNB: Credits */}
        <div className="relative" ref={gnbPopup === "credit" ? gnbPopupRef : undefined}
          onMouseEnter={() => setGnbPopup("credit")} onMouseLeave={() => setGnbPopup((p) => p === "credit" ? null : p)}>
          <button className="flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-[11px]"
            style={{ background: gnbPopup === "credit" ? v("bg-4") : "transparent", border: `1px solid ${v("border")}`, color: v("text-1") }}>
            <CreditCard size={12} /> Credits 1,250
          </button>
          {gnbPopup === "credit" && (
            <div className="absolute right-0 top-full mt-1 w-[260px] rounded-lg overflow-hidden z-50 shadow-xl"
              style={{ background: v("bg-2"), border: `1px solid ${v("border")}` }}>
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${v("border")}` }}>
                <div className="text-[12px] mb-2" style={{ color: v("text-1"), fontWeight: 600 }}>Credit Info</div>
                <div className="flex justify-between text-[11px] mb-1"><span style={sty.text2}>Remaining Credits</span><span style={{ color: v("text-1"), fontWeight: 600 }}>1,250</span></div>
                <div className="flex justify-between text-[11px] mb-1"><span style={sty.text2}>Plan</span><span style={sty.text1}>Pro Plan</span></div>
                <div className="flex justify-between text-[11px]"><span style={sty.text2}>Next Renewal</span><span style={sty.text1}>2026-04-01</span></div>
              </div>
              <div className="px-4 py-3 flex flex-col gap-2">
                <button className="w-full py-2 rounded text-[11px] cursor-pointer transition-colors"
                  style={{ background: v("accent"), color: v("bg-1"), border: "none", fontWeight: 600 }}>
                  Buy Credits
                </button>
                <button className="w-full py-2 rounded text-[11px] cursor-pointer transition-colors flex items-center justify-center gap-1 relative"
                  style={{ background: v("bg-4"), color: v("text-1"), border: `1px solid ${v("border")}` }}
                  onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setGnbLinkTooltip({ text: "pixell.ai/mypage", x: r.left + r.width / 2, y: r.top - 4 }); }}
                  onMouseLeave={() => setGnbLinkTooltip(null)}
                  onClick={() => window.open("https://pixell.ai/mypage", "_blank")}>
                  Manage Plan<ExternalLink size={10} />
                </button>
              </div>
            </div>
          )}
        </div>
        {/* GNB: Account */}
        <div className="relative" ref={gnbPopup === "account" ? gnbPopupRef : undefined}>
          <button className="flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-[11px]"
            style={{ background: gnbPopup === "account" ? v("bg-4") : "transparent", border: `1px solid ${v("border")}`, color: v("text-1") }}
            onClick={() => setGnbPopup((p) => p === "account" ? null : "account")}>
            <User size={12} /> Account
          </button>
          {gnbPopup === "account" && (
            <div className="absolute right-0 top-full mt-1 w-[240px] rounded-lg overflow-hidden z-50 shadow-xl"
              style={{ background: v("bg-2"), border: `1px solid ${v("border")}` }}>
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${v("border")}` }}>
                <div className="text-[12px] mb-1" style={{ color: v("text-1"), fontWeight: 600 }}>Signed-in Account</div>
                <div className="text-[11px]" style={sty.text2}>user@pixell.ai</div>
              </div>
              <div className="px-4 py-3 flex flex-col gap-2">
                <button className="w-full py-2 rounded text-[11px] cursor-pointer transition-colors flex items-center justify-center gap-1"
                  style={{ background: v("bg-4"), color: v("text-1"), border: `1px solid ${v("border")}` }}
                  onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setGnbLinkTooltip({ text: "pixell.ai/mypage", x: r.left + r.width / 2, y: r.top - 4 }); }}
                  onMouseLeave={() => setGnbLinkTooltip(null)}
                  onClick={() => window.open("https://pixell.ai/mypage", "_blank")}>
                  <Settings size={11} /> Account Settings <ExternalLink size={10} />
                </button>
                <button className="w-full py-2 rounded text-[11px] cursor-pointer transition-colors flex items-center justify-center gap-1"
                  style={{ background: v("error"), color: "#fff", border: "none" }}
                  onClick={() => { setGnbPopup(null); alert("You have been signed out and will be redirected to the login screen."); }}>
                  <LogOut size={11} /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
        {/* GNB: Settings */}
        <div className="relative" ref={gnbPopup === "settings" ? gnbPopupRef : undefined}>
          <button className="p-1.5 rounded cursor-pointer"
            style={{ background: gnbPopup === "settings" ? v("bg-4") : "transparent", border: `1px solid ${v("border")}`, color: v("text-1") }}
            onClick={() => setGnbPopup((p) => p === "settings" ? null : "settings")}>
            <Settings size={13} />
          </button>
          {gnbPopup === "settings" && (
            <div className="absolute right-0 top-full mt-1 w-[260px] rounded-lg overflow-hidden z-50 shadow-xl"
              style={{ background: v("bg-2"), border: `1px solid ${v("border")}` }}>
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${v("border")}` }}>
                <div className="text-[12px] mb-2" style={{ color: v("text-1"), fontWeight: 600 }}>GUI Settings</div>
                <div className="mb-3">
                  <div className="text-[11px] mb-1.5" style={sty.text2}>Theme</div>
                  <ThemeSwitcher />
                </div>
                <div className="mb-3">
                  <div className="text-[11px] mb-1.5" style={sty.text2}>Language</div>
                  <div className="flex gap-1">
                    {["English", "Korean", "Japanese"].map((lang) => (
                      <button key={lang} className="px-2 py-1 rounded text-[10px] cursor-pointer transition-colors"
                        style={{
                          background: guiLang === lang ? v("accent") : "transparent",
                          color: guiLang === lang ? v("bg-1") : v("text-2"),
                          border: `1px solid ${guiLang === lang ? v("accent") : v("border")}`,
                        }}
                        onClick={() => setGuiLang(lang)}>{lang}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] mb-1.5" style={sty.text2}>GPU Selection</div>
                  <div className="text-[10px] mb-2" style={sty.text3}>Select up to 2 GPUs.</div>
                  <div className="flex flex-col gap-1.5">
                    {gpuOptions.map((gpu) => {
                      const checked = selectedGpus.includes(gpu);
                      const disabled = !checked && selectedGpus.length >= 2;
                      return (
                        <label key={gpu} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-[11px]"
                          style={{ background: v("bg-1"), border: `1px solid ${v("border")}`, color: disabled ? v("text-3") : v("text-1") }}>
                          <span>{gpu}</span>
                          <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleGpuSelection(gpu)} />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 flex flex-col gap-2">
                <label className="flex items-center justify-between text-[11px] cursor-pointer">
                  <span style={sty.text2}>Check for updates on startup</span>
                  <input type="checkbox" defaultChecked />
                </label>
                <label className="flex items-center justify-between text-[11px] cursor-pointer">
                  <span style={sty.text2}>Show confirmation before exit</span>
                  <input type="checkbox" defaultChecked />
                </label>
                <label className="flex items-center justify-between text-[11px] cursor-pointer">
                  <span style={sty.text2}>Play warning sound on error</span>
                  <input type="checkbox" />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* ============================================================
     RENDER: LEFT PANEL (folder tree + dynamic file list + drag)
     ============================================================ */
  const renderFolderNode = (node: FolderNode, depth: number = 0) => {
    const isSelected = selectedFolder === node.id;
    const isExpanded = expandedFolders.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const iconEl = node.icon === "network" ? <Monitor size={12} /> : node.icon === "external" ? <HardDrive size={12} /> : <FolderOpen size={12} />;

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors"
          style={{
            paddingLeft: `${8 + depth * 16}px`,
            background: isSelected ? v("accent") : "transparent",
            color: isSelected ? v("bg-1") : v("text-1"),
          }}
          onClick={() => {
            selectFolder(node.id);
            if (hasChildren) toggleFolder(node.id);
          }}
          onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = v("bg-hover"); }}
          onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          {hasChildren ? (isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />) : <span className="w-[10px]" />}
          {iconEl}
          <span className="truncate">{node.name}</span>
        </div>
        {hasChildren && isExpanded && node.children!.map((child) => renderFolderNode(child, depth + 1))}
      </div>
    );
  };

  const renderLeftPanel = () => {
    const allFolderFiles = sourceFilesByFolder[selectedFolder] || [];
    const sourceCheckedFiles = allFolderFiles.filter((f) => sourceCheckedIds.has(f.id));

    return (
      <div className="flex flex-col min-h-0" style={{ width: leftPanelWidth, minWidth: 180, background: v("bg-2") }}>
        <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ background: v("bg-3"), borderBottom: `1px solid ${v("border")}` }}>
          <span className="text-[12px]" style={{ ...sty.text1, fontWeight: 600 }}>Import</span>
          <button className="p-1 rounded cursor-pointer" style={sty.text2}><RefreshCw size={12} /></button>
        </div>

        {/* Folder tree */}
        <div className="shrink-0 max-h-[160px] overflow-y-auto p-1.5" style={{ borderBottom: `1px solid ${v("border")}` }}>
          {folderTree.map((node) => renderFolderNode(node))}
        </div>

        {/* Source tabs (below tree, attached to file list) */}
        <div className="flex shrink-0" style={{ background: v("bg-3"), borderBottom: `1px solid ${v("border")}` }}>
          {([
            { key: "video" as const, label: `Video (${typeCounts.video})` },
            { key: "sequence" as const, label: `Sequence (${typeCounts.sequence})` },
            { key: "layer" as const, label: `EXR (${typeCounts.layer})` },
          ]).map((tab) => (
            <button key={tab.key} className="flex-1 text-center py-2 text-[11px] cursor-pointer transition-colors"
              style={{ color: sourceTab === tab.key ? v("accent") : v("text-2"), borderBottom: `2px solid ${sourceTab === tab.key ? v("accent") : "transparent"}`, background: "transparent" }}
              onClick={() => setSourceTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Draggable source file list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {currentSourceFiles.length === 0 ? (
            <div className="p-4 text-center text-[11px]" style={sty.text3}>No {sourceTab === "video" ? "video" : sourceTab === "sequence" ? "sequence" : "EXR"} files in this folder.</div>
          ) : (
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: v("bg-3") }}>
                  <th className="w-5 p-1.5 text-left sticky top-0 z-5" style={{ borderBottom: `1px solid ${v("border")}`, background: v("bg-3") }}>
                    <input type="checkbox"
                      checked={currentSourceFiles.length > 0 && currentSourceFiles.every((f) => sourceCheckedIds.has(f.id))}
                      onChange={(e) => {
                        const ids = new Set(sourceCheckedIds);
                        currentSourceFiles.forEach((f) => { if (e.target.checked) ids.add(f.id); else ids.delete(f.id); });
                        setSourceCheckedIds(ids);
                      }} />
                  </th>
                  <th className="w-8 p-1.5 text-left sticky top-0 z-5" style={{ ...sty.text2, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), fontWeight: 600 }}></th>
                  <th className="p-1.5 text-left sticky top-0 z-5" style={{ ...sty.text2, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), fontWeight: 600 }}>File Name</th>
                  <th className="p-1.5 text-left sticky top-0 z-5" style={{ ...sty.text2, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), fontWeight: 600 }}>Resolution</th>
                  <th className="p-1.5 text-left sticky top-0 z-5" style={{ ...sty.text2, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), fontWeight: 600 }}>
                    {sourceTab === "video" ? "FPS" : sourceTab === "sequence" ? "Frame Range" : "Layer Type"}
                  </th>
                  {sourceTab === "video" && (
                    <th className="p-1.5 text-left sticky top-0 z-5" style={{ ...sty.text2, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), fontWeight: 600 }}>
                      Duration
                    </th>
                  )}
                  {sourceTab === "sequence" && (
                    <th className="p-1.5 text-left sticky top-0 z-5" style={{ ...sty.text2, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), fontWeight: 600 }}>
                      FPS
                    </th>
                  )}
                  {sourceTab === "sequence" && (
                    <th className="p-1.5 text-left sticky top-0 z-5" style={{ ...sty.text2, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), fontWeight: 600 }}>
                      Total Frames
                    </th>
                  )}
                  {sourceTab === "layer" && (
                    <th className="p-1.5 text-left sticky top-0 z-5" style={{ ...sty.text2, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), fontWeight: 600 }}>
                      Selected Layer
                    </th>
                  )}
                  <th className="p-1.5 text-left sticky top-0 z-5" style={{ ...sty.text2, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), fontWeight: 600 }}>
                    Format
                  </th>
                </tr>
              </thead>
              <tbody>
                {currentSourceFiles.map((f) => {
                  const isChecked = sourceCheckedIds.has(f.id);
                  const iconEl = f.type === "video" ? <Film size={13} /> : f.type === "sequence" ? <Image size={13} /> : <Layers size={13} />;
                  const mainInfo = f.type === "video" ? (f.fps || "-") : f.type === "sequence" ? parseFrameRange(f.name) : (f.layer || "-");
                  const seqFps = f.fps || "24";
                  const totalFrames = f.frames || "-";
                  const formatCol = f.name.includes(".") ? f.name.split(".").pop()!.toUpperCase() : "-";
                  // Determine which files to drag: if checked, drag all checked; else just this file
                  const filesToDrag = isChecked && sourceCheckedFiles.length > 0 ? sourceCheckedFiles : [f];
                  return (
                    <tr key={f.id}
                      draggable
                      onDragStart={(e) => handleSourceDragStart(e, filesToDrag)}
                      className="cursor-grab active:cursor-grabbing transition-colors"
                      style={{ borderBottom: `1px solid ${v("bg-3")}` }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = v("bg-3"); }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <td className="p-1.5">
                        <input type="checkbox" checked={isChecked}
                          onChange={() => {
                            setSourceCheckedIds((prev) => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; });
                          }} />
                      </td>
                      <td className="p-1.5">
                        <div className="w-8 h-5 rounded overflow-hidden flex items-center justify-center" style={{ background: v("bg-0"), color: v("text-2") }}>
                          {sourceFileThumbnails[f.id] ? (
                            <img src={sourceFileThumbnails[f.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : iconEl}
                        </div>
                      </td>
                      <td className="p-1.5 max-w-[120px] truncate" style={sty.text1} title={f.name}>{f.name}</td>
                      <td className="p-1.5" style={sty.text2}>{f.res}</td>
                      <td className="p-1.5" style={sty.text2}>{mainInfo}</td>
                      {sourceTab === "video" && <td className="p-1.5" style={sty.text2}>{f.duration || "-"}</td>}
                      {sourceTab === "sequence" && <td className="p-1.5" style={sty.text2}>{seqFps}</td>}
                      {sourceTab === "sequence" && <td className="p-1.5" style={sty.text2}>{totalFrames}</td>}
                      {sourceTab === "layer" && <td className="p-1.5" style={sty.text2}>{f.selected || "Beauty"}</td>}
                      <td className="p-1.5" style={sty.text2}>{formatCol}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Add to queue button */}
        {sourceCheckedIds.size > 0 && (
          <div className="p-2 shrink-0" style={{ borderTop: `1px solid ${v("border")}` }}>
            <button className="w-full py-1.5 rounded text-[11px] cursor-pointer flex items-center justify-center gap-1"
              style={{ background: v("accent"), color: v("bg-1"), border: "none" }}
              onClick={() => {
                const files = (sourceFilesByFolder[selectedFolder] || []).filter((f) => sourceCheckedIds.has(f.id));
                addToQueue(files);
                setSourceCheckedIds(new Set());
              }}>
              <Plus size={12} /> Add to Queue ({sourceCheckedIds.size})
            </button>
          </div>
        )}
      </div>
    );
  };

  const handlePreviewWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setPreviewZoom((z) => Math.max(1, Math.min(12, z + (e.deltaY < 0 ? 0.3 : -0.3))));
  }, []);

  const handlePreviewPointerMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    if (previewViewMode === "split" && splitDragActiveRef.current) {
      setSplitPreviewRatio(x);
      return;
    }
    if (previewZoom > 1) {
      setPreviewPan({ x, y });
    }
  }, [previewViewMode, previewZoom]);

  const renderPreviewCanvas = useCallback((isFullscreen = false) => {
    const containerStyle = { background: v("preview-bg") };
    const transformStyle = {
      transform: `scale(${previewZoom})`,
      transformOrigin: `${previewPan.x * 100}% ${previewPan.y * 100}%`,
      transition: "transform-origin 0.05s ease-out",
      width: "100%",
      height: "100%",
    } as const;
    const beforeStyle = { width: "100%", height: "100%", objectFit: "cover" as const, filter: "blur(1.8px) brightness(0.82) contrast(0.85) saturate(0.7)" };
    const afterStyle = { width: "100%", height: "100%", objectFit: "cover" as const };
    const sideLabelWrap = (children: React.ReactNode) => (
      <div
        className="absolute z-10 pointer-events-none"
        style={{ top: isFullscreen ? 12 : 8, left: isFullscreen ? 12 : 8, right: isFullscreen ? 12 : 8 }}
      >
        {children}
      </div>
    );

    if (!selectedItem) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-4" style={{ ...sty.text3, ...containerStyle }}>
          <Eye size={isFullscreen ? 44 : 36} style={{ opacity: 0.35 }} />
          <div style={{ ...sty.text1, fontWeight: 600 }}>No file selected</div>
          <div className="text-[12px]">Click a file row in the queue</div>
          <div className="text-[12px]">to show the preview here.</div>
        </div>
      );
    }

    if (previewViewMode === "dual") {
      return (
        <div className="flex-1 flex overflow-hidden" style={containerStyle}>
          <div
            className="flex-1 flex flex-col items-center justify-center relative overflow-hidden"
            style={{ borderRight: `1px solid ${v("border")}` }}
          >
            <PreviewSideBadge side="before" align="left" />
            <div style={transformStyle}>
              <img src={curImages.before} alt="before" style={beforeStyle} />
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
            <PreviewSideBadge side="after" align="left" active={hasAfterPreview} />
            {hasAfterPreview ? (
              <div style={transformStyle}>
                <img src={curImages.after} alt="after" style={afterStyle} />
              </div>
            ) : (
              <div className="h-full w-full flex items-center justify-center p-6 text-center" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))" }}>
                <div>
                  <div className="text-[12px] mb-1" style={{ ...sty.text1, fontWeight: 600 }}>Waiting</div>
                  <div className="text-[11px] leading-relaxed" style={sty.text3}>Enhanced output will appear here when ready.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (previewViewMode === "split" && hasAfterPreview) {
      const beforeVisible = splitPreviewRatio > 0.02;
      const afterVisible = splitPreviewRatio < 0.98;
      return (
        <div className="flex-1 relative overflow-hidden" style={containerStyle}>
          {beforeVisible && (
            <div className="absolute z-10 pointer-events-none" style={{ top: isFullscreen ? 12 : 8, left: isFullscreen ? 12 : 8 }}>
              <PreviewSideBadge side="before" active align="left" />
            </div>
          )}
          {afterVisible && (
            <div
              className="absolute z-10 pointer-events-none"
              style={{
                top: isFullscreen ? 12 : 8,
                left: `calc(${splitPreviewRatio * 100}% + ${isFullscreen ? 12 : 8}px)`,
              }}
            >
              <PreviewSideBadge side="after" active align="left" />
            </div>
          )}
          <div className="absolute inset-0" style={transformStyle}>
            <img src={curImages.after} alt="After" style={afterStyle} />
          </div>
          <div
            className="absolute inset-0"
            style={{ ...transformStyle, clipPath: `inset(0 ${100 - splitPreviewRatio * 100}% 0 0)` }}
          >
            <img src={curImages.before} alt="Before" style={beforeStyle} />
          </div>
          <div
            className="absolute inset-y-0 z-20"
            style={{ left: `calc(${splitPreviewRatio * 100}% - 1px)`, width: 2, background: "rgba(255,255,255,0.92)", boxShadow: "0 0 0 1px rgba(0,0,0,0.32)" }}
          />
          <button
            type="button"
            className="absolute inset-y-0 z-30 cursor-ew-resize"
            style={{ left: `calc(${splitPreviewRatio * 100}% - 12px)`, width: 24, background: "transparent", border: "none" }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              splitDragActiveRef.current = true;
            }}
            aria-label="Move split divider"
          >
            <span
              className="absolute left-1/2 top-1/2 h-9 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: "rgba(15,15,18,0.76)", border: `1px solid ${v("border-lt")}` }}
            />
            <span
              className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2"
              style={{ background: "rgba(255,255,255,0.92)", boxShadow: "-3px 0 0 rgba(255,255,255,0.55), 3px 0 0 rgba(255,255,255,0.55)" }}
            />
          </button>
        </div>
      );
    }

    const currentSide: PreviewSide = hasAfterPreview ? togglePreviewSide : "before";
    return (
      <button
        type="button"
        className="flex-1 flex items-center justify-center overflow-hidden relative text-left"
        style={{ ...containerStyle, border: "none", cursor: hasAfterPreview ? "pointer" : "default" }}
        onClick={() => {
          if (!hasAfterPreview) return;
          setTogglePreviewSide((prev) => (prev === "before" ? "after" : "before"));
        }}
      >
        {sideLabelWrap(<PreviewSideBadge side={currentSide} active align="left" />)}
        <div style={transformStyle}>
          <img
            src={currentSide === "before" ? curImages.before : curImages.after}
            alt={currentSide === "before" ? "Before" : "After"}
            style={currentSide === "before" ? beforeStyle : afterStyle}
          />
        </div>
      </button>
    );
  }, [curImages.after, curImages.before, hasAfterPreview, previewPan.x, previewPan.y, previewViewMode, previewZoom, selectedItem, splitPreviewRatio, togglePreviewSide]);

  /* ============================================================
     RENDER: CENTER PANEL (with drop zone)
     ============================================================ */
  const renderCenterPanel = () => (
    <div className="flex-1 flex flex-col min-w-0 min-h-0" style={{ background: v("bg-1") }}>
      {/* Preview panel */}
      <div className="flex flex-col shrink-0" style={{ background: v("bg-0"), borderBottom: `1px solid ${v("border")}` }}>
        <div className="relative flex items-center justify-between px-3 py-1.5 shrink-0" style={{ background: v("bg-3"), borderBottom: `1px solid ${v("border")}` }}>
          <div className="flex items-center gap-2 text-[12px] min-w-0 pr-4" style={{ ...sty.text1, fontWeight: 600 }}>
            <Play size={12} /><span>Preview</span>
            <span style={{ ...sty.text2, fontWeight: 400 }}>
              {centerTab === "watch"
                ? (selectedWatchFolder ? `• ${selectedWatchFolder.path}` : "- No watch folder selected")
                : (selectedItem ? `• ${selectedItem.fileName}` : "- No file selected")}
            </span>
            {centerTab === "queue" && hasAfterPreview && <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: v("success"), color: "#fff" }}>Before / After</span>}
          </div>
          {centerTab === "queue" && (
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1">
              {(["dual", "split", "toggle"] as const).map((mode) => (
                <PreviewModeButton
                  key={mode}
                  mode={mode}
                  active={hasSelectedItem && previewViewMode === mode}
                  disabled={!hasSelectedItem || (!hasAfterPreview && mode !== "dual")}
                  onClick={() => setPreviewViewMode(mode)}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-1">
            {centerTab === "queue" && (
              <button
                className="px-2 py-0.5 rounded text-[10px] cursor-pointer"
                title="Fullscreen compare"
                style={{ background: "transparent", border: `1px solid ${v("border")}`, color: v("text-2") }}
                onClick={() => setFullscreenPreview(true)}
              >
                <Maximize2 size={12} />
              </button>
            )}
            <button className="px-2 py-0.5 rounded text-[10px] cursor-pointer" style={{ background: "transparent", border: `1px solid ${v("border")}`, color: v("text-2") }}
              onClick={() => setPreviewCollapsed(!previewCollapsed)}>
              {previewCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </button>
          </div>
        </div>
        {!previewCollapsed && (
          <>
            <div className="flex" style={{ height: previewHeight }}>
              {centerTab === "watch" ? (
                <div className="flex-1 min-w-0 p-4 overflow-y-auto" style={{ background: v("preview-bg") }}>
                  {selectedWatchFolder ? (
                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      <div className="rounded p-3" style={{ background: v("bg-2"), border: `1px solid ${v("border")}` }}>
                        <div className="mb-2" style={{ ...sty.text1, fontWeight: 700 }}>Watch Status</div>
                        <div style={sty.text2}>Status: <StatusBadge status={selectedWatchFolder.status} /></div>
                        <div className="mt-2" style={sty.text2}>Latest Event: <span style={sty.text1}>{selectedWatchFolder.activity.lastEvent}</span></div>
                        <div className="mt-2" style={sty.text2}>Note: <span style={sty.text1}>{selectedWatchFolder.activity.note}</span></div>
                        {selectedWatchFolder.errorReason && <div className="mt-2" style={{ color: v("error") }}>Error: {selectedWatchFolder.errorReason}</div>}
                      </div>
                      <div className="rounded p-3" style={{ background: v("bg-2"), border: `1px solid ${v("border")}` }}>
                        <div className="mb-2" style={{ ...sty.text1, fontWeight: 700 }}>Processing Activity</div>
                        <div style={sty.text2}>Current Task: <span style={sty.text1}>{getWatchActivityLabel(selectedWatchFolder)}</span></div>
                        <div className="mt-2" style={sty.text2}>In Progress: <span style={sty.text1}>{selectedWatchFolder.activity.processingCount}</span></div>
                        <div className="mt-2" style={sty.text2}>Queued: <span style={sty.text1}>{selectedWatchFolder.activity.queuedCount}</span></div>
                        <div className="mt-2" style={sty.text2}>Detected Files: <span style={sty.text1}>{selectedWatchFolder.detectedFiles}</span></div>
                      </div>
                      <div className="rounded p-3 col-span-2" style={{ background: v("bg-2"), border: `1px solid ${v("border")}` }}>
                        <div className="mb-2" style={{ ...sty.text1, fontWeight: 700 }}>Applied Settings</div>
                        <div style={sty.text2}>AI Model: <span style={sty.text1}>{selectedWatchFolder.settings ? formatModelLabel(selectedWatchFolder.settings.modelSettings) : "No saved settings"}</span></div>
                        <div className="mt-2" style={sty.text2}>Output Settings: <span style={sty.text1}>{selectedWatchFolder.settings ? formatWatchExportSummary(selectedWatchFolder.settings.exportDraft) : "No saved settings"}</span></div>
                        <div className="mt-2" style={sty.text2}>Output Path: <span style={sty.text1}>{selectedWatchFolder.outputPath}</span></div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-[12px]" style={sty.text3}>Select a watch folder row to show its status details here.</div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex min-w-0 relative"
                  onWheel={handlePreviewWheel}
                  onMouseMove={handlePreviewPointerMove}
                  onMouseUp={() => { splitDragActiveRef.current = false; }}
                  onMouseLeave={() => { if (previewZoom <= 1) setPreviewPan({ x: 0.5, y: 0.5 }); }}
                >
                  {renderPreviewCanvas(false)}
                  {previewZoom > 1 && (
                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] z-10 flex items-center gap-1"
                      style={{ background: "rgba(0,0,0,0.6)", color: v("text-1") }}>
                      <ZoomIn size={10} /> {Math.round(previewZoom * 100)}%
                    </div>
                  )}
                </div>
              )}
            </div>
            {centerTab === "queue" && (
            <>
            <div className="flex items-center gap-2 px-3 py-1 text-[11px]" style={{ background: v("bg-2"), borderTop: `1px solid ${v("border")}` }}>
              <button className="p-1 rounded cursor-pointer" style={{ background: "transparent", border: "none", color: v("text-1") }} onClick={() => setPlaybackTime(0)}><SkipBack size={13} /></button>
              <button className="p-1 rounded cursor-pointer" style={{ background: "transparent", border: "none", color: v("text-1") }} onClick={() => setPlaybackTime((t) => Math.max(0, t - 5))}><ChevronsLeft size={13} /></button>
              <button className="p-1 rounded cursor-pointer" style={{ background: "transparent", border: "none", color: v("text-1") }} onClick={() => setIsPlaying(!isPlaying)}>
                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <button className="p-1 rounded cursor-pointer" style={{ background: "transparent", border: "none", color: v("text-1") }} onClick={() => setPlaybackTime((t) => Math.min(100, t + 5))}><ChevronsRight size={13} /></button>
              <button className="p-1 rounded cursor-pointer" style={{ background: "transparent", border: "none", color: v("text-1") }} onClick={() => setPlaybackTime(100)}><SkipForward size={13} /></button>
              <input type="range" className="flex-1 h-0.5 cursor-pointer" min={0} max={100} value={playbackTime}
                onChange={(e) => setPlaybackTime(Number(e.target.value))} style={{ accentColor: v("accent") }} />
              <span className="text-[10px] min-w-[110px] text-center" style={sty.text2}>{selectedItem ? `${pctToTime(playbackTime)} / ${selectedItem.duration}` : "00:00:00 / 00:00:00"}</span>
              {previewZoom > 1 && (
                <button className="p-1 rounded cursor-pointer text-[10px]" title="Reset Zoom"
                  style={{ background: "transparent", border: `1px solid ${v("border")}`, color: v("text-2") }}
                  onClick={() => { setPreviewZoom(1); setPreviewPan({ x: 0.5, y: 0.5 }); }}>
                  <ZoomOut size={12} />
                </button>
              )}
            </div>
            <div className="px-3 py-1.5 relative" style={{ background: v("bg-2"), borderTop: `1px solid ${v("border")}` }}
              onWheel={(e) => { e.preventDefault(); setTimelineZoom((z) => Math.max(1, Math.min(10, z + (e.deltaY < 0 ? 0.5 : -0.5)))); }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={sty.text2}>Timeline Zoom<span style={sty.text3}>({Math.round(timelineZoom * 100)}%)</span></span>
                  <button className="px-1.5 py-0.5 rounded text-[9px] cursor-pointer" title="Set current playhead position as In point"
                    style={{ background: v("bg-4"), color: v("text-1"), border: `1px solid ${v("border")}` }}
                    onClick={() => setTrimIn(Math.min(playbackTime, trimOut))}>
                    Set In
                  </button>
                  <button className="px-1.5 py-0.5 rounded text-[9px] cursor-pointer" title="Set current playhead position as Out point"
                    style={{ background: v("bg-4"), color: v("text-1"), border: `1px solid ${v("border")}` }}
                    onClick={() => setTrimOut(Math.max(playbackTime, trimIn))}>
                    Set Out
                  </button>
                </div>
                <span className="text-[10px]" style={{ color: v("accent") }}>In: {pctToTime(trimIn)} | Out: {pctToTime(trimOut)}</span>
              </div>
              <div ref={timelineTrackRef} className="relative rounded overflow-hidden" style={{ background: v("bg-0"), height: 36 }}>
                {/* Thumbnail strip */}
                <div className="absolute inset-0 flex" style={{ width: `${100 * timelineZoom}%` }}>
                  {Array.from({ length: Math.max(8, Math.round(12 * timelineZoom)) }).map((_, i, arr) => {
                    const thumbSrc = selectedItem ? curImages.thumbs[i % curImages.thumbs.length] : "";
                    return (
                      <div key={i} className="h-full flex-shrink-0 relative overflow-hidden"
                        style={{ width: `${100 / arr.length}%`, borderRight: `1px solid ${v("bg-1")}` }}>
                        {selectedItem ? (
                          <img src={thumbSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.7, filter: `hue-rotate(${i * 8}deg)` }} />
                        ) : (
                          <div className="w-full h-full" style={{ background: `hsl(0, 0%, ${20 + (i % 3) * 3}%)` }} />
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Dimmed outside regions */}
                <div className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: `${trimIn}%`, background: "rgba(0,0,0,0.45)" }} />
                <div className="absolute inset-y-0 right-0 pointer-events-none" style={{ width: `${100 - trimOut}%`, background: "rgba(0,0,0,0.45)" }} />
                {/* Active trim region */}
                <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${trimIn}%`, width: `${trimOut - trimIn}%`, borderTop: `1px solid ${v("accent")}`, borderBottom: `1px solid ${v("accent")}` }} />
                {/* Bracket handles */}
                <button
                  className="absolute top-1/2 -translate-y-1/2 cursor-ew-resize"
                  style={{ left: `calc(${trimIn}% - 6px)`, width: 12, height: 24, background: "transparent", border: "none" }}
                  onMouseDown={(e) => { e.preventDefault(); trimDragRef.current = "in"; document.body.style.userSelect = "none"; }}
                  title="Drag In handle"
                >
                  <span className="block h-full w-full" style={{ borderLeft: `2px solid ${v("accent")}`, borderTop: `2px solid ${v("accent")}`, borderBottom: `2px solid ${v("accent")}` }} />
                </button>
                <button
                  className="absolute top-1/2 -translate-y-1/2 cursor-ew-resize"
                  style={{ left: `calc(${trimOut}% - 6px)`, width: 12, height: 24, background: "transparent", border: "none" }}
                  onMouseDown={(e) => { e.preventDefault(); trimDragRef.current = "out"; document.body.style.userSelect = "none"; }}
                  title="Drag Out handle"
                >
                  <span className="block h-full w-full" style={{ borderRight: `2px solid ${v("accent")}`, borderTop: `2px solid ${v("accent")}`, borderBottom: `2px solid ${v("accent")}` }} />
                </button>
                {/* Playhead */}
                <div className="absolute h-full w-[2px] z-10" style={{ left: `${playbackTime}%`, background: v("error") }}>
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-0 h-0" style={{ borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: `5px solid ${v("error")}` }} />
                </div>
              </div>
            </div>
            </>
            )}
          </>
        )}
      </div>

      {/* Preview-Queue resize handle */}
      {!previewCollapsed && (
        <div className="h-1 shrink-0 cursor-row-resize hover:bg-blue-500/20 transition-colors relative"
          onMouseDown={(e) => startResize("preview", e, previewHeight)}>
          <div className="absolute inset-x-0 top-0 h-px" style={{ background: v("border") }} />
        </div>
      )}

      {/* Center tabs */}
      <div className="flex items-center justify-between shrink-0" style={{ background: v("bg-3"), borderBottom: `1px solid ${v("border")}` }}>
        <div className="flex">
          {(["queue", "watch"] as const).map((tab) => (
            <button key={tab} className="px-4 py-2.5 text-[12px] cursor-pointer" style={{ background: "transparent", border: "none", color: centerTab === tab ? v("accent") : v("text-2"), borderBottom: `2px solid ${centerTab === tab ? v("accent") : "transparent"}` }}
              onClick={() => setCenterTab(tab)}>
              {tab === "queue" ? "Queue" : "Watch Folders"}
            </button>
          ))}
        </div>
        {centerTab === "queue" ? (
          <div className="flex items-center gap-2 pr-3">
            <span className="text-[11px]" style={sty.text2}>Selected: <strong style={sty.text1}>{checkedCount}</strong></span>
            <button className="px-2 py-1 rounded text-[10px] cursor-pointer" style={{ background: checkedCount > 0 ? v("accent") : v("bg-4"), color: checkedCount > 0 ? v("bg-1") : v("text-3"), border: "none" }}
              disabled={checkedCount === 0} onClick={() => alert(`(Demo) Export ${checkedCount} items`)}>Export ({checkedCount})</button>
            <button className="px-2 py-1 rounded text-[10px] cursor-pointer" style={{ background: checkedCount > 0 ? v("text-1") : v("bg-4"), color: checkedCount > 0 ? v("bg-0") : v("text-3"), border: "none" }}
              disabled={checkedCount === 0} onClick={() => alert(`(Demo) Cloud Export ${checkedCount} items`)}>Cloud Export ({checkedCount})</button>
          </div>
        ) : (
          <div className="flex items-center gap-2 pr-3">
            <button
              className="px-2.5 py-1 rounded text-[10px] cursor-pointer"
              style={{ background: selectedWatchFolder && selectedWatchFolder.settings && selectedWatchFolder.status !== "active" ? v("accent") : v("bg-4"), color: selectedWatchFolder && selectedWatchFolder.settings && selectedWatchFolder.status !== "active" ? v("bg-1") : v("text-3"), border: "none" }}
              disabled={!selectedWatchFolder || !selectedWatchFolder.settings || selectedWatchFolder.status === "active"}
              onClick={() => selectedWatchFolder && runWatchFolder(selectedWatchFolder.id)}
            >
              Run
            </button>
            <button
              className="px-2.5 py-1 rounded text-[10px] cursor-pointer"
              style={{ background: selectedWatchFolder && selectedWatchFolder.status === "active" ? v("error") : v("bg-4"), color: selectedWatchFolder && selectedWatchFolder.status === "active" ? "#fff" : v("text-3"), border: "none" }}
              disabled={!selectedWatchFolder || selectedWatchFolder.status !== "active"}
              onClick={() => selectedWatchFolder && stopWatchFolder(selectedWatchFolder.id)}
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Queue tab with drop support */}
      {centerTab === "queue" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden"
          onDragOver={handleQueueDragOver} onDragLeave={handleQueueDragLeave} onDrop={handleQueueDrop}>
          <div className="flex items-center px-3 py-1.5 gap-1 shrink-0" style={{ borderBottom: `1px solid ${v("border")}`, background: v("bg-2") }}>
            {([
              { key: "video" as const, label: `Video (${queueIds.filter((qid) => queueData[qid]?.type === "video").length})` },
              { key: "sequence" as const, label: `Sequence (${queueIds.filter((qid) => queueData[qid]?.type === "sequence").length})` },
              { key: "layer" as const, label: `EXR (${queueIds.filter((qid) => queueData[qid]?.type === "exr").length})` },
            ]).map((t) => (
              <button
                key={t.key}
                className="px-2.5 py-1 rounded text-[10px] cursor-pointer"
                style={{ background: queueJobTab === t.key ? v("bg-4") : "transparent", color: queueJobTab === t.key ? v("text-1") : v("text-2"), border: `1px solid ${queueJobTab === t.key ? v("border-lt") : "transparent"}` }}
                onClick={() => setQueueJobTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead className="sticky top-0 z-10">
                <tr style={{ background: v("bg-3") }}>
                  <th className="p-2 text-left w-7" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}`, background: v("bg-3") }}>
                    <input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} />
                  </th>
                  <th className="p-2 text-left w-14" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}`, background: v("bg-3") }}>
                    Thumbnail                  </th>
                  <th className="p-2 text-left relative" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), width: `${colWidths.filename}px` }}>
                    File Name                    <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/30" onMouseDown={(e) => startColResize("filename", e, colWidths.filename)} />
                  </th>
                  <th className="p-2 text-left relative" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), width: `${colWidths.res}px` }}>
                    Resolution                    <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/30" onMouseDown={(e) => startColResize("res", e, colWidths.res)} />
                  </th>
                  <th className="p-2 text-left relative" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), width: `${colWidths.duration}px` }}>
                    Duration
                    <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/30" onMouseDown={(e) => startColResize("duration", e, colWidths.duration)} />
                  </th>
                  <th className="p-2 text-center relative" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), width: `${colWidths.info}px` }}>
                    Info
                    <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/30" onMouseDown={(e) => startColResize("info", e, colWidths.info)} />
                  </th>
                  <th className="p-2 text-left relative" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), width: `${colWidths.outputPath}px` }}>
                    Output Path
                    <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/30" onMouseDown={(e) => startColResize("outputPath", e, colWidths.outputPath)} />
                  </th>
                  {queueJobTab === "layer" && (
                    <th className="p-2 text-left" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), width: "280px" }}>
                      Selected Layers
                    </th>
                  )}
                  <th className="p-2 text-left" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}`, background: v("bg-3"), width: "100px" }}>
                    Status
                  </th>
                  <th className="p-2 text-left w-7" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}`, background: v("bg-3") }}>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredQueueIds.map((qid) => {
                  const d = queueData[qid]; const isSelected = selectedQueueId === qid;
                  const isDoneRow = d.status === "done";
                  const thumbUrl = queueThumbnails[qid];
                  return (
                    <tr key={qid} className="cursor-pointer transition-colors"
                      style={{
                        background: isSelected ? v("accent-bg") : "transparent",
                        borderBottom: `1px solid ${v("bg-3")}`,
                        borderLeft: isDoneRow ? `3px solid ${v("success")}` : "3px solid transparent",
                      }}
                      onClick={(e) => { if ((e.target as HTMLElement).closest("input, select, button")) return; selectRow(qid); }}
                      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = v("bg-2"); }}
                      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      <td className="p-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checkedIds.has(qid)} onChange={() => toggleCheck(qid)} /></td>
                      <td className="p-2">
                        <div className="w-12 h-7 rounded overflow-hidden flex items-center justify-center relative" style={{ background: v("bg-0") }}>
                          {thumbUrl ? (
                            <>
                              <img src={thumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: isDoneRow ? 0.55 : 1, filter: isDoneRow ? "grayscale(0.4)" : "none" }} />
                              {isDoneRow && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Check size={14} style={{ color: "#fff", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }} />
                                </div>
                              )}
                            </>
                          ) : (
                            <Film size={14} style={sty.text2} />
                          )}
                        </div>
                      </td>
                      <td className="p-2" title={d.fileName} style={{ ...sty.text1, opacity: isDoneRow ? 0.6 : 1 }}>
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          {d.type === "video" ? <Film size={12} className="shrink-0" style={sty.text2} /> : d.type === "sequence" ? <Image size={12} className="shrink-0" style={sty.text2} /> : d.type === "exr" ? <Layers size={12} className="shrink-0" style={sty.text2} /> : <Film size={12} className="shrink-0" style={sty.text2} />}
                          <span className="truncate">{d.fileName}</span>
                        </div>
                      </td>
                      <td className="p-2" style={{ ...sty.text2, opacity: isDoneRow ? 0.55 : 1 }}>
                        <span>{d.res}</span>
                        <span style={{ color: v("text-3") }}> → </span>
                        <span style={{ color: getQueueAfterResolution(d) !== d.res ? v("accent") : v("text-2") }}>{getQueueAfterResolution(d)}</span>
                      </td>
                      <td className="p-2" style={{ ...sty.text2, opacity: isDoneRow ? 0.55 : 1 }}>{d.duration}</td>
                      <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="p-1 rounded cursor-pointer"
                          style={{ background: "transparent", border: `1px solid ${v("border")}`, color: v("text-2") }}
                          onClick={() => { setMetadataTargetId(qid); setModalOpen("queueMetadata"); }}
                          title="View metadata"
                        >
                          <Info size={12} />
                        </button>
                      </td>
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="text-[10px] truncate block w-full text-left underline cursor-pointer"
                          title={d.outputPath}
                          style={{ color: isDoneRow ? v("text-3") : v("accent"), background: "transparent", border: "none" }}
                          onClick={() => chooseOutputPath(qid)}
                        >
                          {d.outputPath}
                        </button>
                      </td>
                      {queueJobTab === "layer" && (
                        <td className="p-2" onClick={(e) => e.stopPropagation()}>
                          {(() => {
                            const options = getExrLayerOptions(d);
                            const selectedLayers = layerSelectionsByQueue[qid] || getDefaultSelectedExrLayers(d);
                            const selectableCount = options.filter((opt) => opt.selectable).length;
                            return (
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-[10px]" style={sty.text2}>
                                    Selected{" "}
                                    <span style={{ color: selectedLayers.length > 0 ? v("accent") : v("text-3"), fontWeight: 600 }}>
                                      {selectedLayers.length}/{selectableCount}
                                    </span>
                                  </div>
                                  <div className="text-[10px] truncate" style={sty.text3} title={selectedLayers.join(", ")}>
                                    {selectedLayers.length === selectableCount ? "All layers selected" : selectedLayers.length > 0 ? selectedLayers.join(", ") : "No layers selected"}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded text-[10px] cursor-pointer shrink-0"
                                  style={{ background: v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openLayerEditor(qid);
                                  }}
                                >
                                  Edit Layers
                                </button>
                              </div>
                            );
                          })()}
                        </td>
                      )}
                      <td className="p-2">
                        {d.status === "processing" && d.progress != null ? <ProgressBar value={d.progress} /> : <StatusBadge status={d.status} />}
                      </td>
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        {isDoneRow ? (
                          <span className="p-0.5 inline-flex" style={{ color: v("text-3") }}><Check size={13} /></span>
                        ) : (
                          <button className="p-0.5 cursor-pointer rounded" style={{ background: "transparent", border: "none", color: v("text-2") }}
                            onClick={() => alert("(Demo) Cancel action")}><X size={13} /></button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Drop zone */}
          <div className="mx-3 mb-3 mt-1 p-5 rounded text-center text-[12px] shrink-0 transition-colors"
            style={{
              border: `2px dashed ${dragOverQueue ? v("accent") : v("border")}`,
              color: dragOverQueue ? v("accent") : v("text-3"),
              background: dragOverQueue ? v("accent-bg") : "transparent",
            }}>
            {dragOverQueue ? (
              <span style={{ fontWeight: 600 }}>Drop files here</span>
            ) : (
              <>
                Drag files or folders here to add them to the queue.<br /><span className="text-[11px]">Supported formats: MP4, MOV, MXF, TS, JPG, PNG, BMP, DPX, TIFF, OpenEXR</span>
                <div className="mt-3">
                  <input ref={fileInputRef} type="file" multiple className="hidden"
                    accept=".mp4,.mov,.mxf,.ts,.jpg,.png,.bmp,.exr,.tif,.tiff,.dpx"
                    onChange={handleFileBrowserAdd} />
                  <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-[12px] cursor-pointer transition-colors"
                    style={{ background: v("bg-4"), color: v("text-1"), border: `1px solid ${v("border")}` }}
                    onClick={() => fileInputRef.current?.click()}>
                    <FilePlus2 size={14} /> Add Files
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Watch tab */}
      {centerTab === "watch" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0">
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
              <thead className="sticky top-0 z-10">
                <tr style={{ background: v("bg-3") }}>
                  {["Folder Path", "Folder Name", "Applied Settings", "Output Path", "Watch Status", "Current Activity", "Detected Files", ""].map((h, i) => (
                    <th key={i} className="p-2 text-left" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}`, background: v("bg-3") }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedWatchFolders.map((w) => {
                  const isSelected = selectedWatchId === w.id;
                  const isLocked = w.status === "active";
                  const settingsSummary = w.settings ? formatModelLabel(w.settings.modelSettings) : "No saved settings";
                  const exportSummary = w.settings ? formatWatchExportSummary(w.settings.exportDraft) : "Save AI model and output settings";
                  const rowAccent = w.status === "active" ? v("success") : w.status === "error" ? v("error") : w.status === "paused" ? v("warning") : v("border");
                  return (
                    <tr
                      key={w.id}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: `1px solid ${v("bg-3")}`, borderLeft: `3px solid ${rowAccent}`, background: isSelected ? v("accent-bg") : "transparent" }}
                      onClick={() => setSelectedWatchId(w.id)}
                      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = v("bg-2"); }}
                      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <td className="p-2" style={sty.text1}>{w.path}</td>
                      <td className="p-2" style={sty.text1}>
                        <div className="font-medium">{w.name}</div>
                      </td>
                      <td className="p-2">
                        <div className="text-[10px]" style={sty.text3}>
                          {isLocked
                            ? `${settingsSummary} / ${exportSummary} / Editing is disabled while active`
                            : w.settings
                              ? `${settingsSummary} / ${exportSummary}`
                              : "Select the row to configure it in the right panel."}
                        </div>
                      </td>
                      <td className="p-2" style={sty.text2}>{w.outputPath}</td>
                      <td className="p-2">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={w.status} />
                          {w.errorReason && <span className="text-[10px]" style={{ color: v("error") }}>{w.errorReason}</span>}
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="text-[10px]" style={sty.text1}>{getWatchActivityLabel(w)}</div>
                        <div className="text-[10px] mt-0.5" style={sty.text3}>
                          In progress {w.activity.processingCount} / queued {w.activity.queuedCount} / latest {w.activity.lastEvent}
                        </div>
                      </td>
                      <td className="p-2" style={sty.text1}>{w.detectedFiles}</td>
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <button className="cursor-pointer" style={{ background: "transparent", border: "none", color: v("text-2") }} onClick={() => setWatchDeleteTargetId(w.id)}><X size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mx-3 mb-3 mt-1 p-6 rounded text-center text-[12px]" style={{ border: `2px dashed ${v("border")}`, color: v("text-3") }}>Drag watch folders here to add them.</div>
        </div>
      )}
    </div>
  );

  /* ============================================================
     RENDER: RIGHT PANEL
     ============================================================ */
  const SelectField = ({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: string[]; disabled?: boolean; }) => (
    <div className="mb-2">
      <label className="block text-[11px] mb-1" style={{ ...sty.text2, opacity: disabled ? 0.5 : 1 }}>{label}</label>
      <select className="w-full px-2 py-1.5 rounded text-[11px]" style={{ background: disabled ? v("bg-3") : v("bg-1"), color: disabled ? v("text-3") : v("text-1"), border: `1px solid ${v("border")}`, cursor: disabled ? "not-allowed" : "pointer" }}
        value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );

  const InlineSelectField = ({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: string[]; disabled?: boolean; }) => (
    <div className="flex items-center gap-2 py-1">
      <label className="text-[11px] w-[110px] shrink-0" style={{ ...sty.text2, opacity: disabled ? 0.5 : 1 }}>{label}</label>
      <select className="flex-1 px-2 py-1.5 rounded text-[11px]" style={{ background: disabled ? v("bg-3") : v("bg-1"), color: disabled ? v("text-3") : v("text-1"), border: `1px solid ${v("border")}`, cursor: disabled ? "not-allowed" : "pointer" }}
        value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );

  const InlineInputField = ({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; }) => (
    <div className="flex items-center gap-2 py-1">
      <label className="text-[11px] w-[110px] shrink-0" style={{ ...sty.text2, opacity: disabled ? 0.5 : 1 }}>{label}</label>
      <input
        className="flex-1 px-2 py-1.5 rounded text-[11px]"
        style={{ background: disabled ? v("bg-3") : v("bg-1"), color: disabled ? v("text-3") : v("text-1"), border: `1px solid ${v("border")}` }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );

  const renderExportAfterEditor = (itemName: string, fallbackText: string) => {
    if (itemName === "Resolution") {
      const value = exportDraft.resizeEnabled ? exportDraft.resolutionPreset : "Original";
      return (
        <select
          className="w-full px-2 py-1 rounded text-[10px]"
          style={{ background: v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "Original") setExportDraft((d) => ({ ...d, resizeEnabled: false, resolutionPreset: "3840x2160" }));
            else setExportDraft((d) => ({ ...d, resizeEnabled: true, resolutionPreset: next }));
          }}
        >
          {["Original", "1280x720", "1920x1080", "3840x2160", "7680x4320"].map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (itemName === "FPS") {
      const xavc = isXavcCodec(exportDraft.codecSelect);
      return (
        <select className="w-full px-2 py-1 rounded text-[10px]" style={{ background: xavc ? v("bg-3") : v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
          disabled={xavc}
          value={exportDraft.fpsSelect} onChange={(e) => setExportDraft((d) => ({ ...d, fpsSelect: e.target.value }))}>
          {FPS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (itemName === "Codec") {
      return (
        <select className="w-full px-2 py-1 rounded text-[10px]" style={{ background: v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
          value={exportDraft.codecSelect}
          onChange={(e) => {
            const next = e.target.value;
            setExportDraft((d) => {
              const containers = containersForCodec(next);
              const profiles = profilesForCodec(next);
              const audios = audioCodecsForCodec(next);
              const merged: ExportDraft = { ...d, codecSelect: next };
              if (!containers.includes(merged.containerSelect)) merged.containerSelect = containers[0];
              if (profiles.length && !profiles.includes(merged.profileSelect)) merged.profileSelect = defaultProfileForCodec(next);
              if (!audios.includes(merged.audioCodec)) merged.audioCodec = audios[0];
              if (isXavcCodec(next)) { merged.resizeEnabled = true; merged.resolutionPreset = "3840x2160"; }
              return merged;
            });
          }}>
          {VIDEO_CODEC_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (itemName === "Container") {
      const opts = containersForCodec(exportDraft.codecSelect);
      return (
        <select className="w-full px-2 py-1 rounded text-[10px]" style={{ background: opts.length <= 1 ? v("bg-3") : v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
          disabled={opts.length <= 1}
          value={exportDraft.containerSelect} onChange={(e) => setExportDraft((d) => ({ ...d, containerSelect: e.target.value }))}>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (itemName === "Audio Codec") {
      const opts = audioCodecsForCodec(exportDraft.codecSelect);
      return (
        <select className="w-full px-2 py-1 rounded text-[10px]" style={{ background: opts.length <= 1 ? v("bg-3") : v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
          disabled={opts.length <= 1}
          value={exportDraft.audioCodec} onChange={(e) => setExportDraft((d) => ({ ...d, audioCodec: e.target.value }))}>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (itemName === "Quality") {
      if (isProResCodec(exportDraft.codecSelect) || isXavcCodec(exportDraft.codecSelect)) return <span style={sty.text3}>-</span>;
      return (
        <select className="w-full px-2 py-1 rounded text-[10px]" style={{ background: exportDraft.advancedOpen ? v("bg-3") : v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
          disabled={exportDraft.advancedOpen}
          value={exportDraft.qualitySelect} onChange={(e) => setExportDraft((d) => ({ ...d, qualitySelect: e.target.value }))}>
          {QUALITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (itemName === "Bitrate Mode") {
      return (
        <select className="w-full px-2 py-1 rounded text-[10px]" style={{ background: v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
          value={exportDraft.advancedOpen ? exportDraft.bitrateMode : "-"}
          onChange={(e) => {
            const v0 = e.target.value;
            if (v0 === "-") setExportDraft((d) => ({ ...d, advancedOpen: false }));
            else setExportDraft((d) => ({ ...d, advancedOpen: true, bitrateMode: v0 }));
          }}>
          {["-", "VBR", "CBR"].map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (itemName === "Bitrate") {
      if (!exportDraft.advancedOpen) return <span style={sty.text3}>Advanced bitrate settings are off</span>;
      return (
        <div className="flex gap-1">
          <input className="w-1/2 px-2 py-1 rounded text-[10px]" style={{ background: v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
            value={exportDraft.targetBitrate} onChange={(e) => setExportDraft((d) => ({ ...d, targetBitrate: e.target.value }))} />
          <input className="w-1/2 px-2 py-1 rounded text-[10px]" style={{ background: v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
            value={exportDraft.maxBitrate} onChange={(e) => setExportDraft((d) => ({ ...d, maxBitrate: e.target.value }))} />
        </div>
      );
    }
    return <span style={sty.text2}>{fallbackText}</span>;
  };

  const renderRightPanel = () => {
    const ms = selectedItem?.modelSettings;
    const isMulti = checkedIds.size >= 2;
    const isDone = selectedItem?.status === "done";
    const isFailed = selectedItem?.status === "failed";
    const isProcessing = selectedItem?.status === "processing";
    const isDisabled = isDone || isProcessing; // done & processing = read-only, failed = editable
    if (centerTab === "watch") {
      const folder = selectedWatchFolder;
      const isEditing = !!folder;
      const isWatchLocked = !!folder && folder.status === "active";
      const watchSummary = folder?.settings ? formatModelLabel(folder.settings.modelSettings) : "No saved AI settings";
      const exportSummary = folder?.settings ? formatWatchExportSummary(folder.settings.exportDraft) : "No saved output settings";
      return (
        <div className="flex flex-col min-h-0" style={{ width: rightPanelWidth, minWidth: 220, background: v("bg-2") }}>
          <div className="flex-1 overflow-y-auto min-h-0">
            {!folder ? (
              <div className="p-4 flex flex-col gap-3" style={sty.text2}>
                <div style={{ ...sty.text1, fontWeight: 700 }}>No watch folder selected</div>
                <div className="p-3 rounded text-[12px] leading-relaxed" style={{ background: v("bg-1"), border: `1px dashed ${v("border-lt")}` }}>
                  Select a watch folder row to open its status and settings panel.
                </div>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 text-[11px] flex items-center justify-between" style={{ borderBottom: `1px solid ${v("border")}` }}>
                  <div>
                    <div style={{ ...sty.text1, fontWeight: 700 }}>{folder.name}</div>
                    <div style={sty.text3}>{folder.path}</div>
                  </div>
                  <StatusBadge status={folder.status} />
                </div>

                {folder.status === "active" && (
                  <div className="px-3 py-2 text-[11px] flex items-center gap-2" style={{ background: "rgba(34,197,94,0.1)", borderBottom: `1px solid ${v("border")}` }}>
                    <RefreshCw size={13} className="animate-spin" style={{ color: v("success") }} />
                    <span style={{ color: v("success"), fontWeight: 600 }}>Monitoring Active</span>
                    <span style={sty.text2}>Stop monitoring before editing settings.</span>
                  </div>
                )}
                {folder.status === "error" && (
                  <div className="px-3 py-2 text-[11px] flex items-center gap-2" style={{ background: "rgba(239,68,68,0.1)", borderBottom: `1px solid ${v("border")}` }}>
                    <X size={13} style={{ color: v("error") }} />
                    <span style={{ color: v("error"), fontWeight: 600 }}>Error State</span>
                    <span style={sty.text2}>{folder.errorReason}</span>
                  </div>
                )}

                <Section title="Watch Folder Options">
                  <div className="space-y-2 text-[11px]" style={sty.text2}>
                    <div>AI Model: <span style={sty.text1}>{watchSummary}</span></div>
                    <div>Output Format: <span style={sty.text1}>{exportSummary}</span></div>
                    <div>Output Path: <span style={sty.text1}>{folder.outputPath}</span></div>
                  </div>
                </Section>

                {isEditing && (
                  <>
                    <Section title="AI Models">
                      <div style={{ opacity: isWatchLocked ? 0.45 : 1, pointerEvents: isWatchLocked ? "none" : "auto" }}>
                        <div className="flex items-center gap-2 py-1">
                          <label className="text-[11px] w-[110px] shrink-0" style={sty.text2}>Upscale</label>
                          <select className="flex-1 px-2 py-1.5 rounded text-[11px]"
                            style={{ background: v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}`, cursor: "pointer" }}
                            value={watchDraftModelSettings.upscaler}
                            onChange={(e) => setWatchDraftModelSettings((prev) => ({ ...prev, upscaler: e.target.value as UpscalerLevel }))}>
                            {UPSCALER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-2 py-1">
                          <label className="text-[11px] w-[110px] shrink-0" style={sty.text2}>Edge Enhancement</label>
                          <div className="flex-1 flex justify-end">
                            <Toggle active={watchDraftModelSettings.edgeEnhancement}
                              onClick={() => setWatchDraftModelSettings((prev) => ({ ...prev, edgeEnhancement: !prev.edgeEnhancement }))} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 py-1">
                          <label className="text-[11px] w-[110px] shrink-0" style={sty.text2}>De-interlace</label>
                          <div className="flex-1 flex justify-end">
                            <Toggle active={watchDraftModelSettings.deinterlace}
                              onClick={() => setWatchDraftModelSettings((prev) => ({ ...prev, deinterlace: !prev.deinterlace }))} />
                          </div>
                        </div>
                      </div>
                    </Section>

                    <Section title="Export Settings">
                      <div style={{ opacity: isWatchLocked ? 0.45 : 1, pointerEvents: isWatchLocked ? "none" : "auto" }}>
                      {(() => {
                        const wCodec = watchDraftExport.codecSelect;
                        const wXavc = isXavcCodec(wCodec);
                        const wProRes = isProResCodec(wCodec);
                        const wContainerOpts = containersForCodec(wCodec);
                        const wProfileOpts = profilesForCodec(wCodec);
                        const wAudioOpts = audioCodecsForCodec(wCodec);
                        const wAudioIsCopy = watchDraftExport.audioCodec.startsWith("Copy");
                        const setW = (patch: Partial<ExportDraft>) => setWatchDraftExport((d) => {
                          const merged = { ...d, ...patch } as ExportDraft;
                          // Cascade after codec change
                          if (patch.codecSelect) {
                            const containers = containersForCodec(merged.codecSelect);
                            if (!containers.includes(merged.containerSelect)) merged.containerSelect = containers[0];
                            const profiles = profilesForCodec(merged.codecSelect);
                            if (profiles.length && !profiles.includes(merged.profileSelect)) merged.profileSelect = defaultProfileForCodec(merged.codecSelect);
                            const audios = audioCodecsForCodec(merged.codecSelect);
                            if (!audios.includes(merged.audioCodec)) merged.audioCodec = audios[0];
                            if (isXavcCodec(merged.codecSelect)) {
                              merged.resizeEnabled = true;
                              merged.resolutionPreset = "3840x2160";
                            }
                          }
                          return merged;
                        });
                        return (
                          <>
                            <div className="flex items-center gap-2 py-1">
                              <label className="text-[11px] w-[110px] shrink-0" style={sty.text2}>Resize</label>
                              <div className="flex-1 flex justify-end">
                                <Toggle active={watchDraftExport.resizeEnabled} onClick={() => !wXavc && setW({ resizeEnabled: !watchDraftExport.resizeEnabled })} />
                              </div>
                            </div>
                            {!watchDraftExport.resizeEnabled && (() => {
                              const factor = getModelUpscaleFactor(watchDraftModelSettings.upscaler);
                              return (
                                <div className="flex items-center gap-2 py-1">
                                  <label className="text-[11px] w-[110px] shrink-0" style={sty.text3}>Output Resolution</label>
                                  <span className="text-[11px]" style={sty.text2}>{factor === 1 ? "Source" : `Source × ${factor}`}</span>
                                </div>
                              );
                            })()}
                            {watchDraftExport.resizeEnabled && (() => {
                              const aiLevel = watchDraftModelSettings.upscaler;
                              const aiOpts = buildAiResolutionOptions(aiLevel, null);
                              const overrideHint = getResizeOverrideHint({
                                resizeEnabled: true,
                                resolutionPreset: watchDraftExport.resolutionPreset,
                                aiLevel,
                                sourceRes: null,
                                customW: watchDraftExport.customWidth,
                                customH: watchDraftExport.customHeight,
                              });
                              return (
                                <div className="mt-1 mb-1 rounded p-2" style={{ background: v("bg-1"), border: `1px solid ${v("border")}` }}>
                                  <div className="flex items-center gap-2 py-1">
                                    <label className="text-[11px] w-[110px] shrink-0" style={{ ...sty.text2, opacity: wXavc ? 0.5 : 1 }}>Output Resolution</label>
                                    <select className="flex-1 px-2 py-1.5 rounded text-[11px]"
                                      style={{ background: wXavc ? v("bg-3") : v("bg-1"), color: wXavc ? v("text-3") : v("text-1"), border: `1px solid ${v("border")}`, cursor: wXavc ? "not-allowed" : "pointer" }}
                                      value={wXavc ? "3840x2160" : watchDraftExport.resolutionPreset}
                                      onChange={(e) => setW({ resolutionPreset: e.target.value })}
                                      disabled={wXavc}>
                                      {wXavc ? (
                                        <option value="3840x2160">3840x2160 (2160p 4K)</option>
                                      ) : (
                                        <>
                                          <optgroup label="From AI Models">
                                            {aiOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                          </optgroup>
                                          <optgroup label="Standard">
                                            {STANDARD_RESOLUTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                          </optgroup>
                                        </>
                                      )}
                                    </select>
                                  </div>
                                  {overrideHint && !wXavc && (
                                    <div className="flex items-center gap-1 pl-[118px] mt-1 mb-1 text-[11px]"
                                      style={{ color: v("accent"), fontWeight: 600 }}>
                                      <Info size={12} />
                                      <span>{overrideHint}</span>
                                    </div>
                                  )}
                                  {watchDraftExport.resolutionPreset === "Custom" && !wXavc && (
                                    <>
                                      <InlineInputField label="Width" value={watchDraftExport.customWidth} onChange={(v0) => setW({ customWidth: v0 })} />
                                      <InlineInputField label="Height" value={watchDraftExport.customHeight} onChange={(v0) => setW({ customHeight: v0 })} />
                                    </>
                                  )}
                                  <InlineSelectField label="Scaling Mode" value={watchDraftExport.resizeMode} onChange={(v0) => setW({ resizeMode: v0 })} options={RESIZE_MODE_OPTIONS} disabled={wXavc} />
                                  <InlineSelectField label="Aspect Ratio" value={watchDraftExport.aspectRatio} onChange={(v0) => setW({ aspectRatio: v0 })} options={ASPECT_RATIO_OPTIONS} disabled={wXavc} />
                                </div>
                              );
                            })()}
                            <InlineSelectField label="Frame Rate" value={watchDraftExport.fpsSelect} onChange={(v0) => setW({ fpsSelect: v0 })} options={FPS_OPTIONS} disabled={wXavc} />
                            <InlineSelectField label="Scan Type" value={watchDraftExport.scanType} onChange={(v0) => setW({ scanType: v0 })} options={SCAN_TYPE_OPTIONS} />
                            <InlineSelectField label="Video Codec" value={wCodec} onChange={(v0) => setW({ codecSelect: v0 })} options={VIDEO_CODEC_OPTIONS} />
                            <InlineSelectField label="Container" value={watchDraftExport.containerSelect} onChange={(v0) => setW({ containerSelect: v0 })} options={wContainerOpts} disabled={wContainerOpts.length <= 1} />
                            {wProfileOpts.length > 0 && (
                              <InlineSelectField label="Profile" value={watchDraftExport.profileSelect} onChange={(v0) => setW({ profileSelect: v0 })} options={wProfileOpts} />
                            )}
                            {!wProRes && !wXavc && (
                              <InlineSelectField label="Quality" value={watchDraftExport.qualitySelect} onChange={(v0) => setW({ qualitySelect: v0 })} options={QUALITY_OPTIONS} />
                            )}
                            <InlineSelectField label="Audio Codec" value={watchDraftExport.audioCodec} onChange={(v0) => setW({ audioCodec: v0 })} options={wAudioOpts} disabled={wAudioOpts.length <= 1} />
                            {!wAudioIsCopy && watchDraftExport.audioCodec !== "PCM" && (
                              <InlineSelectField label="Audio Bitrate" value={watchDraftExport.audioBitrate} onChange={(v0) => setW({ audioBitrate: v0 })} options={AUDIO_BITRATE_OPTIONS} />
                            )}
                            <InlineSelectField label="Timecode Mode" value={watchDraftExport.timecodeMode} onChange={(v0) => setW({ timecodeMode: v0 })} options={TIMECODE_MODE_OPTIONS} />
                          </>
                        );
                      })()}
                      </div>
                    </Section>
                  </>
                )}
              </>
            )}
          </div>
          {folder && isEditing && (
            <div className="p-3 flex gap-2 shrink-0 sticky bottom-0" style={{ background: v("bg-3"), borderTop: `1px solid ${v("border")}` }}>
              {isWatchLocked ? (
                <button
                  className="flex-1 py-2.5 rounded text-[13px] cursor-pointer flex items-center justify-center gap-1.5"
                  style={{ background: v("error"), color: "#fff", border: "none", fontWeight: 600 }}
                  onClick={() => stopWatchFolder(folder.id)}
                >
                  <X size={14} /> Stop Monitoring
                </button>
              ) : (
                <button
                  className="flex-1 py-2.5 rounded text-[13px] cursor-pointer flex items-center justify-center gap-1.5"
                  style={{ background: v("accent"), color: v("bg-1"), border: "none", fontWeight: 600 }}
                  onClick={applyWatchSettings}
                >
                  <Check size={14} /> Apply Settings
                </button>
              )}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col min-h-0" style={{ width: rightPanelWidth, minWidth: 220, background: v("bg-2") }}>
        <div className="flex-1 overflow-y-auto min-h-0">
        {!selectedItem ? (
          <div className="p-4 flex flex-col gap-3" style={sty.text2}>
            <div style={{ ...sty.text1, fontWeight: 700 }}>No file selected</div>
            <div className="p-3 rounded text-[12px] leading-relaxed" style={{ background: v("bg-1"), border: `1px dashed ${v("border-lt")}` }}>
              <div>• Click a file row in the <b>queue</b></div><div>&nbsp;&nbsp;to activate the preview and settings panel.</div>
              <div>• Check multiple files</div><div>&nbsp;&nbsp;to switch into batch action and comparison mode.</div>
            </div>
          </div>
        ) : (
          <>
            {/* Status banner for done/failed/processing */}
            {isDone && (
              <div className="px-3 py-2 text-[11px] flex items-center gap-2" style={{ background: "rgba(34,197,94,0.1)", borderBottom: `1px solid ${v("border")}` }}>
                <Check size={14} style={{ color: v("success") }} />
                <span style={{ color: v("success"), fontWeight: 600 }}>Completed</span>
                <span style={sty.text2}>Result review only</span>
              </div>
            )}
            {isProcessing && (
              <div className="px-3 py-2 text-[11px] flex items-center gap-2" style={{ background: "rgba(59,130,246,0.1)", borderBottom: `1px solid ${v("border")}` }}>
                <RefreshCw size={14} className="animate-spin" style={{ color: v("info") }} />
                <span style={{ color: v("info"), fontWeight: 600 }}>Processing ({selectedItem?.progress ?? 0}%)</span>
                <span style={sty.text2}>Settings locked</span>
              </div>
            )}
            {isFailed && (
              <div className="px-3 py-2 text-[11px] flex items-center gap-2" style={{ background: "rgba(239,68,68,0.1)", borderBottom: `1px solid ${v("border")}` }}>
                <X size={14} style={{ color: v("error") }} />
                <span style={{ color: v("error"), fontWeight: 600 }}>Failed</span>
                <span style={sty.text2}>Edit settings and retry</span>
              </div>
            )}

            <div className="px-3 py-2 text-[11px] flex items-center justify-between" style={{ borderBottom: `1px solid ${v("border")}` }}>
              <span style={sty.text2}>Selection Status</span>
              <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ background: v("bg-4"), color: v("text-1") }}>
                {isMulti ? checkedIds.size : 1} selected              </span>
            </div>

            {isMulti && (
              <Section title="Multi-Select Guide">
                <div className="space-y-2 text-[11px] leading-relaxed" style={sty.text2}>
                  <div><b>{checkedIds.size}</b> files are currently checked.</div>
                  <div>Available actions:</div>
                  <div>• Run batch export with the top `Export (N)` / `Cloud Export (N)` buttons</div>
                  <div>• Compare Before/After metadata across multiple files</div>
                  <div>• Edit detailed AI model and export settings by selecting a single row</div>
                  <div className="pt-1">
                    <button
                      className="px-2.5 py-1 rounded text-[10px] cursor-pointer"
                      style={{ background: v("bg-4"), color: v("text-1"), border: `1px solid ${v("border")}` }}
                      onClick={() => setModalOpen("multiVideoInfo")}
                    >
                      Open Metadata Compare ({checkedIds.size})
                    </button>
                  </div>
                </div>
              </Section>
            )}

            {/* AI Models — hidden in multi-select mode */}
            {!isMulti && ms && (
              <Section title="AI Models" icon={<HelpCircle size={12} className="cursor-pointer" style={sty.text2} onClick={() => setModalOpen("modelHelp")} />}>
                <div style={{ opacity: isDisabled ? 0.45 : 1, pointerEvents: isDisabled ? "none" : "auto" }}>
                  <div className="flex items-center gap-2 py-1"
                    onMouseEnter={(e) => { const info = modelTooltipInfo.upscaler; if (info) { const rect = e.currentTarget.getBoundingClientRect(); setTooltip({ title: info.title, desc: info.desc, x: rect.left - 290, y: rect.top - 4 }); } }}
                    onMouseLeave={() => setTooltip(null)}>
                    <label className="text-[11px] w-[110px] shrink-0" style={sty.text2}>Upscale</label>
                    <select className="flex-1 px-2 py-1.5 rounded text-[11px]"
                      style={{ background: v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}`, cursor: "pointer" }}
                      value={ms.upscaler}
                      onChange={(e) => selectedQueueId && setUpscaler(selectedQueueId, e.target.value as UpscalerLevel)}>
                      {UPSCALER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 py-1"
                    onMouseEnter={(e) => { const info = modelTooltipInfo.edgeEnhancement; if (info) { const rect = e.currentTarget.getBoundingClientRect(); setTooltip({ title: info.title, desc: info.desc, x: rect.left - 290, y: rect.top - 4 }); } }}
                    onMouseLeave={() => setTooltip(null)}>
                    <label className="text-[11px] w-[110px] shrink-0" style={sty.text2}>Edge Enhancement</label>
                    <div className="flex-1 flex justify-end">
                      <Toggle active={ms.edgeEnhancement} onClick={() => !isDisabled && selectedQueueId && toggleEdgeEnhancement(selectedQueueId)} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 py-1"
                    onMouseEnter={(e) => { const info = modelTooltipInfo.deinterlace; if (info) { const rect = e.currentTarget.getBoundingClientRect(); setTooltip({ title: info.title, desc: info.desc, x: rect.left - 290, y: rect.top - 4 }); } }}
                    onMouseLeave={() => setTooltip(null)}>
                    <label className="text-[11px] w-[110px] shrink-0" style={sty.text2}>De-interlace</label>
                    <div className="flex-1 flex justify-end">
                      <Toggle active={ms.deinterlace} onClick={() => !isDisabled && selectedQueueId && toggleDeinterlace(selectedQueueId)} />
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {/* Export Settings - hidden in multi-select mode */}
            {!isMulti && (() => {
              const codecIsXavc = isXavcCodec(codecSelect);
              const codecIsProRes = isProResCodec(codecSelect);
              const containerOpts = containersForCodec(codecSelect);
              const profileOpts = profilesForCodec(codecSelect);
              const audioCodecOpts = audioCodecsForCodec(codecSelect);
              const showQuality = !codecIsProRes && !codecIsXavc;
              const showAdvanced = !codecIsProRes && !codecIsXavc;
              const showProfileMain = profileOpts.length > 0;
              const audioIsCopy = audioCodec.startsWith("Copy");
              return (
              <Section title="Export Settings">
                {/* ── Resize / Scaling ── */}
                <div className="flex items-center gap-2 py-1">
                  <label className="text-[11px] w-[110px] shrink-0" style={{ ...sty.text2, opacity: isDisabled ? 0.5 : 1 }}>Resize</label>
                  <div className="flex-1 flex justify-end">
                    <Toggle active={resizeEnabled} onClick={() => !isDisabled && !codecIsXavc && setResizeEnabled(!resizeEnabled)} />
                  </div>
                </div>
                {!resizeEnabled && selectedItem && (
                  <div className="flex items-center gap-2 py-1">
                    <label className="text-[11px] w-[110px] shrink-0" style={{ ...sty.text3, opacity: isDisabled ? 0.5 : 1 }}>Output Resolution</label>
                    <span className="text-[11px]" style={{ ...sty.text2, opacity: isDisabled ? 0.5 : 1 }}>{getUpscaledResolution(selectedItem)}</span>
                  </div>
                )}
                {resizeEnabled && (() => {
                  const aiLevel: UpscalerLevel = ms?.upscaler ?? "off";
                  const sourceRes = selectedItem?.res ?? null;
                  const aiOpts = buildAiResolutionOptions(aiLevel, sourceRes);
                  const overrideHint = getResizeOverrideHint({ resizeEnabled, resolutionPreset, aiLevel, sourceRes, customW: customWidth, customH: customHeight });
                  return (
                    <div className="mt-1 mb-1 rounded p-2" style={{ background: v("bg-1"), border: `1px solid ${v("border")}`, opacity: isDisabled ? 0.5 : 1 }}>
                      <div className="flex items-center gap-2 py-1">
                        <label className="text-[11px] w-[110px] shrink-0" style={{ ...sty.text2, opacity: isDisabled || codecIsXavc ? 0.5 : 1 }}>Output Resolution</label>
                        <select className="flex-1 px-2 py-1.5 rounded text-[11px]"
                          style={{ background: isDisabled || codecIsXavc ? v("bg-3") : v("bg-1"), color: isDisabled || codecIsXavc ? v("text-3") : v("text-1"), border: `1px solid ${v("border")}`, cursor: isDisabled || codecIsXavc ? "not-allowed" : "pointer" }}
                          value={codecIsXavc ? "3840x2160" : resolutionPreset}
                          onChange={(e) => setResolutionPreset(e.target.value)}
                          disabled={isDisabled || codecIsXavc}>
                          {codecIsXavc ? (
                            <option value="3840x2160">3840x2160 (2160p 4K)</option>
                          ) : (
                            <>
                              <optgroup label="From AI Models">
                                {aiOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </optgroup>
                              <optgroup label="Standard">
                                {STANDARD_RESOLUTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </optgroup>
                            </>
                          )}
                        </select>
                      </div>
                      {overrideHint && !codecIsXavc && (
                        <div className="flex items-center gap-1 pl-[118px] mt-1 mb-1 text-[11px]"
                          style={{ color: v("accent"), fontWeight: 600 }}>
                          <Info size={12} />
                          <span>{overrideHint}</span>
                        </div>
                      )}
                      {resolutionPreset === "Custom" && !codecIsXavc && (
                        <>
                          <InlineInputField label="Width" value={customWidth} onChange={setCustomWidth} disabled={isDisabled} />
                          <InlineInputField label="Height" value={customHeight} onChange={setCustomHeight} disabled={isDisabled} />
                        </>
                      )}
                      <InlineSelectField label="Scaling Mode" value={resizeMode} onChange={setResizeMode} options={RESIZE_MODE_OPTIONS} disabled={isDisabled || codecIsXavc} />
                      <InlineSelectField label="Aspect Ratio" value={aspectRatio} onChange={setAspectRatio} options={ASPECT_RATIO_OPTIONS} disabled={isDisabled || codecIsXavc} />
                    </div>
                  );
                })()}

                {/* ── Video core ── */}
                <InlineSelectField label="Frame Rate" value={fpsSelect} onChange={setFpsSelect} options={FPS_OPTIONS} disabled={isDisabled || codecIsXavc} />
                <InlineSelectField label="Scan Type" value={scanType} onChange={setScanType} options={SCAN_TYPE_OPTIONS} disabled={isDisabled} />
                <InlineSelectField label="Video Codec" value={codecSelect} onChange={setCodecSelect} options={VIDEO_CODEC_OPTIONS} disabled={isDisabled} />
                <InlineSelectField label="Container" value={containerSelect} onChange={setContainerSelect} options={containerOpts} disabled={isDisabled || containerOpts.length <= 1} />
                {showProfileMain && (
                  <InlineSelectField label="Profile" value={profileSelect} onChange={setProfileSelect} options={profileOpts} disabled={isDisabled} />
                )}
                {showQuality && (
                  <InlineSelectField label="Quality" value={qualitySelect} onChange={setQualitySelect} options={QUALITY_OPTIONS} disabled={isDisabled || advancedOpen} />
                )}

                {/* ── Audio ── */}
                <InlineSelectField label="Audio Codec" value={audioCodec} onChange={setAudioCodec} options={audioCodecOpts} disabled={isDisabled || audioCodecOpts.length <= 1} />
                {!audioIsCopy && audioCodec !== "PCM" && (
                  <InlineSelectField label="Audio Bitrate" value={audioBitrate} onChange={setAudioBitrate} options={AUDIO_BITRATE_OPTIONS} disabled={isDisabled} />
                )}
                <InlineSelectField label="Audio Channels" value={audioChannels} onChange={setAudioChannels} options={AUDIO_CHANNEL_OPTIONS} disabled={isDisabled} />
                <InlineSelectField label="Sample Rate" value={audioSampleRate} onChange={setAudioSampleRate} options={AUDIO_SAMPLE_RATE_OPTIONS} disabled={isDisabled} />

                {/* ── Timecode ── */}
                <InlineSelectField label="Timecode Mode" value={timecodeMode} onChange={setTimecodeMode} options={TIMECODE_MODE_OPTIONS} disabled={isDisabled} />

                {/* ── Bitrate (advanced) ── */}
                {showAdvanced && !isDisabled && (
                  <button className="flex items-center gap-1 py-1 text-[11px] cursor-pointer" style={{ background: "transparent", border: "none", color: v("accent") }} onClick={() => setAdvancedOpen(!advancedOpen)}>
                    {advancedOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />} Bitrate Setting (Advanced)
                  </button>
                )}
                {showAdvanced && advancedOpen && !isDisabled && (
                  <div className="mt-1 rounded p-2" style={{ background: v("bg-1"), border: `1px solid ${v("border")}` }}>
                    <InlineSelectField label="Bitrate Mode" value={bitrateMode} onChange={setBitrateMode} options={["VBR", "CBR"]} />
                    <InlineInputField label="Target Mbps" value={targetBitrate} onChange={setTargetBitrate} />
                    <InlineInputField label="Max Mbps" value={maxBitrate} onChange={setMaxBitrate} disabled={bitrateMode === "CBR"} />
                    <div className="flex items-center gap-2 py-1">
                      <label className="text-[11px] w-[110px] shrink-0" style={sty.text2}>2-pass Encoding</label>
                      <div className="flex-1 flex justify-end"><Toggle active={twoPass} onClick={() => setTwoPass(!twoPass)} /></div>
                    </div>
                  </div>
                )}

              </Section>
              );
            })()}

          </>
        )}
        </div>
        {selectedItem && (
          <div className="p-3 flex gap-2 shrink-0 sticky bottom-0" style={{ background: v("bg-3"), borderTop: `1px solid ${v("border")}` }}>
            {isDone ? (
              <button className="flex-1 py-2.5 rounded text-[13px] cursor-pointer flex items-center justify-center gap-1.5"
                style={{ background: v("accent"), color: v("bg-1"), border: "none", fontWeight: 600 }}
                onClick={() => selectedQueueId && duplicateQueueItem(selectedQueueId)}>
                <Copy size={14} /> Duplicate Queue Item
              </button>
            ) : isProcessing ? (
              <button className="flex-1 py-2.5 rounded text-[13px] cursor-pointer flex items-center justify-center gap-1.5"
                style={{ background: v("error"), color: "#fff", border: "none", fontWeight: 600 }}>
                <X size={14} /> Cancel Job
              </button>
            ) : (
              <>
                <button
                  className="flex-1 py-2.5 rounded text-[13px] cursor-pointer flex items-center justify-center gap-1.5"
                  style={{ background: v("accent"), color: v("bg-1"), border: "none", fontWeight: 600 }}
                  onClick={() => selectedQueueId && openExportReview(selectedQueueId)}
                >
                  <Play size={14} /> Export
                </button>
                <button className="flex-1 py-2.5 rounded text-[13px] cursor-pointer flex items-center justify-center gap-1.5" style={{ background: v("text-1"), color: v("bg-0"), border: "none", fontWeight: 600 }}><CloudUpload size={14} /> Cloud Export</button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ============================================================
     RENDER: MODALS
     ============================================================ */
  const renderModals = () => (
    <>
      {/* Event Log */}
      <Modal open={modalOpen === "eventLog"} onClose={() => setModalOpen(null)} title="Event Log">
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
            <thead><tr>{["Time", "Level", "Source", "Message"].map((h) => <th key={h} className="p-2 text-left" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}`, background: v("bg-3") }}>{h}</th>)}</tr></thead>
            <tbody>{eventLogs.map((log, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${v("bg-3")}` }}>
                <td className="p-2" style={sty.text2}>{log.time}</td>
                <td className="p-2" style={{ color: log.level === "ERROR" ? v("error") : log.level === "WARN" ? v("warning") : v("text-2"), fontWeight: 700 }}>{log.level}</td>
                <td className="p-2" style={sty.text1}>{log.source}</td><td className="p-2" style={sty.text1}>{log.message}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Modal>

      <Modal open={!!watchDeleteTargetId} onClose={() => setWatchDeleteTargetId(null)} title="Delete Watch Folder">
        {(() => {
          const target = watchFolders.find((folder) => folder.id === watchDeleteTargetId);
          if (!target) return null;
          const isActiveTarget = target.status === "active";
          return (
            <div>
              <div className="text-[12px] leading-relaxed" style={sty.text2}>
                {isActiveTarget
                  ? `"${target.name}" is currently Active. Stop monitoring before deleting it.`
                  : `Delete the watch folder "${target.name}"?`}
              </div>
              <div className="mt-2 text-[11px]" style={sty.text3}>{target.path}</div>
              <div className="mt-4 flex gap-2 justify-end">
                <button className="px-3 py-1.5 rounded text-[12px] cursor-pointer" style={{ background: v("bg-4"), color: v("text-1"), border: "none" }} onClick={() => setWatchDeleteTargetId(null)}>
                  Cancel
                </button>
                <button
                  className="px-3 py-1.5 rounded text-[12px] cursor-pointer"
                  style={{ background: isActiveTarget ? v("bg-4") : v("error"), color: isActiveTarget ? v("text-3") : "#fff", border: "none" }}
                  disabled={isActiveTarget}
                  onClick={() => deleteWatchFolder(target.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Preset Management Modal (Card-based list) */}
      <Modal open={modalOpen === "preset"} onClose={() => { setModalOpen(null); setEditingPreset(null); setPresetEditOpen(false); }} title="Preset Management" size="md">
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {presets.map((p) => {
            const modelLabel = formatModelLabel(p.modelSettings);
            const resLabel = p.exportSettings.resize === "2x" ? "2x Upscale" : p.exportSettings.resize === "custom" ? (p.exportSettings.customRes || "Custom") : "Original";
            return (
              <div key={p.id} className="rounded-lg p-3.5 flex items-center gap-3 transition-colors group"
                style={{ background: v("bg-1"), border: `1px solid ${v("border")}` }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = v("border-lt"); }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = v("border"); }}>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] truncate" style={{ ...sty.text1, fontWeight: 600 }}>{p.name}</div>
                  <div className="text-[11px] mt-0.5 truncate" style={sty.text2}>{modelLabel}</div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: v("bg-3"), color: v("text-2") }}>{p.exportSettings.codec}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: v("bg-3"), color: v("text-2") }}>{p.exportSettings.container}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: v("bg-3"), color: v("text-2") }}>{resLabel}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: v("bg-3"), color: v("text-2") }}>Q: {p.exportSettings.quality}</span>
                    {p.exportSettings.frameRate !== "Original" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: v("bg-3"), color: v("text-2") }}>{p.exportSettings.frameRate}</span>
                    )}
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button className="px-2.5 py-1 rounded text-[11px] cursor-pointer transition-colors"
                    style={{ background: v("bg-4"), color: v("text-1"), border: "none" }}
                    onClick={() => { setEditingPreset(JSON.parse(JSON.stringify(p))); setPresetEditOpen(true); }}>Edit</button>
                  <button className="p-1.5 rounded cursor-pointer transition-colors" title="Duplicate"
                    style={{ background: "transparent", border: `1px solid ${v("border")}`, color: v("text-2") }}
                    onClick={() => handleDuplicatePreset(p, p.id)}><Copy size={12} /></button>
                  <button className="p-1.5 rounded cursor-pointer transition-colors" title="Delete"
                    style={{ background: "transparent", border: `1px solid ${v("border")}`, color: v("error") }}
                    onClick={() => { if (confirm(`Delete preset "${p.name}"?`)) handleDeletePreset(p.id); }}><Trash2 size={12} /></button>
                </div>
              </div>
            );
          })}
          {presets.length === 0 && (
            <div className="py-10 text-center text-[12px]" style={sty.text3}>No presets have been created yet.<br/>Use the button below to add a new preset.</div>
          )}
        </div>
        {/* Bottom actions */}
        <div className="flex items-center gap-2 mt-4 pt-3" style={{ borderTop: `1px solid ${v("border")}` }}>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] cursor-pointer"
            style={{ background: v("bg-4"), color: v("text-1"), border: "none" }}><Download size={12} /> Import</button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] cursor-pointer"
            style={{ background: v("bg-4"), color: v("text-1"), border: "none" }}><Upload size={12} /> Export</button>
          <div className="flex-1" />
          <button className="flex items-center gap-1 px-3 py-2 rounded text-[12px] cursor-pointer"
            style={{ background: v("accent"), color: v("bg-1"), border: "none" }}
            onClick={handleAddPreset}><Plus size={12} /> New Preset</button>
          <button className="px-4 py-2 rounded text-[12px] cursor-pointer"
            style={{ background: v("bg-4"), color: v("text-1"), border: "none" }}
            onClick={() => { setModalOpen(null); setEditingPreset(null); setPresetEditOpen(false); }}>Close</button>
        </div>
      </Modal>

      {/* ?? Preset Edit Modal (nested over preset list) ?? */}
      {presetEditOpen && editingPreset && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => { setPresetEditOpen(false); setEditingPreset(null); }}>
          <div className="w-[440px] max-h-[85vh] overflow-y-auto rounded-lg p-5 shadow-2xl" style={{ background: v("bg-2") }}
            onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 mb-4" style={{ borderBottom: `1px solid ${v("border")}` }}>
              <span className="text-[15px]" style={{ ...sty.text1, fontWeight: 600 }}>Edit Preset</span>
              <button onClick={() => { setPresetEditOpen(false); setEditingPreset(null); }} className="cursor-pointer p-1 rounded hover:opacity-70" style={sty.text2}><X size={16} /></button>
            </div>

            {/* Preset Name */}
            <div className="mb-4">
              <label className="block text-[11px] mb-1.5" style={sty.text2}>Preset Name</label>
              <input type="text" className="w-full px-3 py-2.5 rounded text-[13px]"
                style={{ background: v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
                value={editingPreset.name}
                onChange={(e) => setEditingPreset({ ...editingPreset, name: e.target.value })} autoFocus />
            </div>

            {/* AI Models */}
            <div className="mb-4">
              <label className="block text-[11px] mb-2" style={sty.text2}>AI Models</label>
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px]" style={sty.text1}>Upscale</span>
                  <select className="w-[180px] px-2.5 py-2 rounded text-[12px]"
                    style={{ background: v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
                    value={editingPreset.modelSettings.upscaler}
                    onChange={(e) => setEditingPreset({ ...editingPreset, modelSettings: { ...editingPreset.modelSettings, upscaler: e.target.value as UpscalerLevel } })}>
                    {UPSCALER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px]" style={sty.text1}>Edge Enhancement</span>
                  <Toggle active={editingPreset.modelSettings.edgeEnhancement}
                    onClick={() => setEditingPreset({ ...editingPreset, modelSettings: { ...editingPreset.modelSettings, edgeEnhancement: !editingPreset.modelSettings.edgeEnhancement } })} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px]" style={sty.text1}>De-interlace</span>
                  <Toggle active={editingPreset.modelSettings.deinterlace}
                    onClick={() => setEditingPreset({ ...editingPreset, modelSettings: { ...editingPreset.modelSettings, deinterlace: !editingPreset.modelSettings.deinterlace } })} />
                </div>
              </div>
            </div>

            {/* Export Settings */}
            <div className="mb-4">
              <label className="block text-[11px] mb-2" style={sty.text2}>Export Settings</label>
              <div className="flex flex-col gap-2.5">
                {([
                  { key: "codec" as const, label: "Codec", options: ["H.264", "H.265", "ProRes", "XAVC"] },
                  { key: "container" as const, label: "Container", options: ["MP4", "MOV", "MXF", "MKV", "TS"] },
                  { key: "frameRate" as const, label: "Frame Rate", options: ["Original", "23.976", "24", "25", "29.97", "30", "50", "59.94", "60"] },
                  { key: "audio" as const, label: "Audio", options: ["Copy", "AAC", "MP3", "PCM", "AC3"] },
                  { key: "profile" as const, label: "Profile", options: ["Baseline", "Main", "High"] },
                  { key: "bitrate" as const, label: "Bitrate", options: ["Auto", "4 Mbps", "8 Mbps", "12 Mbps", "20 Mbps", "40 Mbps", "80 Mbps"] },
                ] as const).map((field) => (
                  <div key={field.key} className="flex items-center justify-between">
                    <span className="text-[12px]" style={sty.text1}>{field.label}</span>
                    <select className="w-[180px] px-2.5 py-2 rounded text-[12px]"
                      style={{ background: v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
                      value={editingPreset.exportSettings[field.key]}
                      onChange={(e) => {
                        setEditingPreset({ ...editingPreset, exportSettings: { ...editingPreset.exportSettings, [field.key]: e.target.value } });
                      }}>
                      {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
                {/* Resize */}
                <div className="flex items-center justify-between">
                  <span className="text-[12px]" style={sty.text1}>Resize</span>
                  <select className="w-[180px] px-2.5 py-2 rounded text-[12px]"
                    style={{ background: v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
                    value={editingPreset.exportSettings.resize}
                    onChange={(e) => {
                      setEditingPreset({ ...editingPreset, exportSettings: { ...editingPreset.exportSettings, resize: e.target.value as any } });
                    }}>
                    <option value="Original">Original</option>
                    <option value="2x">2x Upscale</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                {editingPreset.exportSettings.resize === "custom" && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px]" style={sty.text1}>Resolution</span>
                    <input type="text" className="w-[180px] px-2.5 py-2 rounded text-[12px]" placeholder="e.g. 3840x2160"
                      style={{ background: v("bg-1"), color: v("text-1"), border: `1px solid ${v("border")}` }}
                      value={editingPreset.exportSettings.customRes || ""}
                      onChange={(e) => {
                        setEditingPreset({ ...editingPreset, exportSettings: { ...editingPreset.exportSettings, customRes: e.target.value } });
                      }} />
                  </div>
                )}
              </div>
            </div>

            {/* Quality */}
            <div className="mb-5">
              <label className="block text-[11px] mb-2" style={sty.text2}>Quality</label>
              <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${v("border")}` }}>
                {(["Low", "Good", "Best"] as const).map((q) => (
                  <button key={q} className="flex-1 py-2.5 text-[12px] cursor-pointer transition-colors"
                    style={{
                      background: editingPreset.exportSettings.quality === q ? v("accent") : v("bg-1"),
                      color: editingPreset.exportSettings.quality === q ? v("bg-1") : v("text-2"),
                      border: "none", fontWeight: editingPreset.exportSettings.quality === q ? 600 : 400,
                    }}
                    onClick={() => {
                      setEditingPreset({ ...editingPreset, exportSettings: { ...editingPreset.exportSettings, quality: q } });
                    }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-3" style={{ borderTop: `1px solid ${v("border")}` }}>
              <button className="px-4 py-2 rounded text-[12px] cursor-pointer"
                style={{ background: v("bg-4"), color: v("text-1"), border: "none" }}
                onClick={() => { setPresetEditOpen(false); setEditingPreset(null); }}>Cancel</button>
              <button className="px-5 py-2 rounded text-[12px] cursor-pointer flex items-center gap-1.5"
                style={{ background: v("accent"), color: v("bg-1"), border: "none", fontWeight: 600 }}
                onClick={handleUpdatePreset}><Check size={13} /> Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Model Help */}
      <Modal open={modalOpen === "modelHelp"} onClose={() => setModalOpen(null)} title="AI Model Guide" size="lg">
        <div className="space-y-3">
          {[
            {
              name: "Upscaler — 2x",
              type: "Geometry",
              summary: "Doubles the input resolution.",
              bestFor: "Low-resolution sources, archive restoration, large-screen delivery",
              caution: "Pair with Edge Enhancement when the source has soft edges",
            },
            {
              name: "Upscaler — 4x",
              type: "Geometry",
              summary: "Quadruples the input resolution by running upscale twice.",
              bestFor: "SD-to-4K, very low-resolution archives",
              caution: "Slow and memory-intensive — verify a short clip first",
            },
            {
              name: "Edge Enhancement",
              type: "Detail",
              summary: "Improves edge clarity and texture detail. Independent of the upscaler — applies on top of the chosen upscale level.",
              bestFor: "High-compression videos, fine detail restoration",
              caution: "Overuse can create halos around edges",
            },
            {
              name: "De-interlace",
              type: "Scan Convert",
              summary: "Converts interlaced signals into progressive frames. Independent toggle.",
              bestFor: "Broadcast sources and SD/HD interlaced footage",
              caution: "Results may vary depending on source characteristics",
            },
          ].map((m) => (
            <div key={m.name} className="rounded p-3" style={{ border: `1px solid ${v("border")}`, background: v("bg-1") }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px]" style={{ ...sty.text1, fontWeight: 700 }}>{m.name}</div>
                <span className="px-2 py-0.5 rounded text-[10px]" style={{ background: v("bg-3"), color: v("text-2") }}>{m.type}</span>
              </div>
              <div className="text-[11px] mb-2" style={sty.text2}>{m.summary}</div>
              <div className="text-[10px] mb-1" style={sty.text3}>Best for: {m.bestFor}</div>
              <div className="text-[10px] mb-2" style={sty.text3}>Caution: {m.caution}</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded p-2" style={{ background: v("bg-0"), border: `1px solid ${v("border")}` }}>
                  <div className="text-[10px] mb-1" style={sty.text3}>Before</div>
                  <div className="h-16 rounded" style={{ background: "linear-gradient(135deg, rgba(120,120,120,0.45), rgba(70,70,70,0.45))" }} />
                </div>
                <div className="rounded p-2" style={{ background: v("bg-0"), border: `1px solid ${v("border")}` }}>
                  <div className="text-[10px] mb-1" style={sty.text3}>After</div>
                  <div className="h-16 rounded" style={{ background: "linear-gradient(135deg, rgba(90,180,255,0.35), rgba(40,120,255,0.35))" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Multi Video Info - Metadata Compare */}
      <Modal open={modalOpen === "multiVideoInfo"} onClose={() => setModalOpen(null)} title={`Metadata Compare (${checkedIds.size})`} size="lg">
        <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
          <thead><tr>{["File Name", "Before", "After", "Applied Models"].map((h) => <th key={h} className="p-2 text-left" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}` }}>{h}</th>)}</tr></thead>
          <tbody>{Array.from(checkedIds).map((qid) => {
            const d = queueData[qid]; if (!d) return null;
            const outRes = getQueueAfterResolution(d); const outFps = getOutputFps(d.fps);
            return (
              <tr key={qid} style={{ borderBottom: `1px solid ${v("bg-3")}` }}>
                <td className="p-2" style={sty.text1}>{d.fileName}</td>
                <td className="p-2 text-[10px] leading-relaxed" style={sty.text2}>Res: {d.res}<br />FPS: {d.fps}<br />Codec: {d.codec}<br />Container: {d.container}</td>
                <td className="p-2 text-[10px] leading-relaxed">
                  <span style={{ color: outRes !== d.res ? v("accent") : v("text-2") }}>Res: {outRes}</span><br />
                  <span style={{ color: outFps !== d.fps ? v("accent") : v("text-2") }}>FPS: {outFps}</span><br />
                  <span style={{ color: codecSelect !== d.codec ? v("accent") : v("text-2") }}>Codec: {codecSelect}</span><br />
                  <span style={{ color: containerSelect !== d.container ? v("accent") : v("text-2") }}>Container: {containerSelect}</span>
                </td>
                <td className="p-2 text-[10px]" style={sty.text2}>{d.modelSettings ? formatModelLabel(d.modelSettings) : "-"}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </Modal>

      <Modal
        open={modalOpen === "queueMetadata" && !!metadataTargetId && !!queueData[metadataTargetId]}
        onClose={() => { setModalOpen(null); setMetadataTargetId(null); }}
        title={metadataTargetId && queueData[metadataTargetId] ? `Metadata Details - ${queueData[metadataTargetId].fileName}` : "Metadata Details"}
        size="lg"
      >
        {metadataTargetId && queueData[metadataTargetId] && (
          <div>
            <div className="mb-3 text-[11px]" style={sty.text2}>
              Displays Before/After comparison based on the attached metadata sheet (full metadata item set).
            </div>
            {Array.from(new Set(buildQueueMetadataRows(queueData[metadataTargetId]).map((row) => row.section))).map((section) => {
              const collapsed = !!metadataCollapsed[section];
              const rows = buildQueueMetadataRows(queueData[metadataTargetId]).filter((row) => row.section === section);
              return (
                <div key={section} className="mb-3 rounded" style={{ border: `1px solid ${v("border")}` }}>
                  <button
                    className="w-full px-3 py-2 text-left text-[12px] flex items-center justify-between cursor-pointer"
                    style={{ background: v("bg-3"), color: v("text-1"), border: "none", fontWeight: 600 }}
                    onClick={() => setMetadataCollapsed((prev) => ({ ...prev, [section]: !collapsed }))}
                  >
                    <span>{section}</span>
                    {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {!collapsed && (
                    <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: "26%" }} />
                        <col style={{ width: "37%" }} />
                        <col style={{ width: "37%" }} />
                      </colgroup>
                      <thead>
                        <tr>
                          {["Field", "Before", "After"].map((h) => (
                            <th key={h} className="p-2 text-left" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, idx) => (
                          <tr key={`${row.section}-${row.item}-${idx}`} style={{ borderBottom: `1px solid ${v("bg-3")}` }}>
                            <td className="p-2" style={sty.text1}>{row.item}</td>
                            <td className="p-2" style={sty.text2}>{row.before}</td>
                            <td className="p-2" style={{ color: row.before !== row.after ? v("accent") : v("text-2") }}>{row.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal
        open={modalOpen === "exportReview" && !!exportReview && !!queueData[exportReview.qid]}
        onClose={() => { setModalOpen(null); setExportReview(null); }}
        title={exportReview && queueData[exportReview.qid] ? `Export Review - ${queueData[exportReview.qid].fileName}` : "Export Review"}
        size="lg"
      >
        {exportReview && queueData[exportReview.qid] && (
          <div className="space-y-3 pb-14">
            <div className="mt-2">
              {Array.from(new Set(buildExportReviewRows(queueData[exportReview.qid], exportDraft, exportReview).map((row) => row.section))).map((section) => {
                const rows = buildExportReviewRows(queueData[exportReview.qid], exportDraft, exportReview).filter((row) => row.section === section);
                const editableItems = new Set(["Resolution", "FPS", "Codec", "Container", "Quality", "Bitrate Mode", "Bitrate", "Audio Codec"]);
                const changedRows = rows.filter((r) => r.changed || editableItems.has(r.item));
                const unchangedRows = rows.filter((r) => !r.changed);
                const showUnchanged = !!exportMetaShowUnchanged[section];
                const isUnchangedSection = changedRows.length === 0;
                const forceTableSection = section === "Color Info";
                const visibleChangedRows = forceTableSection ? rows : changedRows;
                return (
                  <div key={section} className="mb-3 rounded" style={{ border: `1px solid ${v("border")}` }}>
                    <div className="px-3 py-2 flex items-center justify-between" style={{ background: v("bg-3") }}>
                      <span className="text-[12px]" style={{ ...sty.text1, fontWeight: 600 }}>{section}</span>
                      <button
                        className="text-[10px] px-2 py-1 rounded cursor-pointer"
                        style={{ background: v("bg-4"), color: v("text-1"), border: "none" }}
                        onClick={() => setExportMetaShowUnchanged((prev) => ({ ...prev, [section]: !showUnchanged }))}
                      >
                        {showUnchanged ? "Compact View" : "Full View"}
                      </button>
                    </div>
                    {isUnchangedSection && !showUnchanged && !forceTableSection ? null : isUnchangedSection && !forceTableSection ? (
                      <div className="px-3 py-2">
                        {unchangedRows.map((row, idx) => (
                          <div key={`u-${section}-${idx}`} className="text-[11px] py-1" style={sty.text3}>
                            {row.item}: {row.after}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                        <colgroup>
                          <col style={{ width: "26%" }} />
                          <col style={{ width: "37%" }} />
                          <col style={{ width: "37%" }} />
                        </colgroup>
                        <thead>
                          <tr>
                            {["Field", "Before", "After"].map((h) => (
                              <th key={h} className="p-2 text-left" style={{ ...sty.text2, fontWeight: 600, borderBottom: `1px solid ${v("border")}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visibleChangedRows.map((row, idx) => (
                            <tr key={`c-${section}-${idx}`} style={{ borderBottom: `1px solid ${v("bg-3")}` }}>
                              <td className="p-2" style={sty.text1}>{row.item}</td>
                              <td className="p-2" style={sty.text2}>{row.before}</td>
                              <td className="p-2" style={{ color: row.changed ? v("accent") : v("text-2"), fontWeight: row.changed ? 600 : 400 }}>
                                {renderExportAfterEditor(row.item, row.after)}
                              </td>
                            </tr>
                          ))}
                          {!forceTableSection && showUnchanged && unchangedRows.map((row, idx) => (
                            <tr key={`u-${section}-${idx}`} style={{ borderBottom: `1px solid ${v("bg-3")}` }}>
                              <td className="p-2" style={sty.text2}>{row.item}</td>
                              <td className="p-2" style={sty.text3}>{row.before}</td>
                              <td className="p-2" style={sty.text3}>{row.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 pt-2 pb-1" style={{ borderTop: `1px solid ${v("border")}`, background: v("bg-2") }}>
              <button className="px-3 py-1.5 rounded text-[12px] cursor-pointer" style={{ background: v("bg-4"), color: v("text-1"), border: "none" }} onClick={() => { setModalOpen(null); setExportReview(null); }}>Cancel</button>
              <button className="px-4 py-1.5 rounded text-[12px] cursor-pointer" style={{ background: v("accent"), color: v("bg-1"), border: "none", fontWeight: 600 }} onClick={performExportStart}>Export Start</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={modalOpen === "layerEditor" && !!layerEditQueueId && !!queueData[layerEditQueueId]}
        onClose={() => { setModalOpen(null); setLayerEditQueueId(null); }}
        title={layerEditQueueId && queueData[layerEditQueueId] ? `Edit Layers - ${queueData[layerEditQueueId].fileName}` : "Edit Layers"}
        size="md"
      >
        {layerEditQueueId && queueData[layerEditQueueId] && (() => {
          const item = queueData[layerEditQueueId];
          const options = getExrLayerOptions(item);
          const selectedLayers = layerSelectionsByQueue[layerEditQueueId] || getDefaultSelectedExrLayers(item);
          const selectableOptions = options.filter((opt) => opt.selectable);
          return (
            <div className="space-y-3">
              <div className="text-[11px]" style={sty.text2}>
                All layers are selected by default. Click a layer to exclude it.
              </div>
              <div className="text-[10px]" style={sty.text3}>
                At least one layer must remain selected.
              </div>
              <div className="flex flex-wrap gap-2">
                {options.map((opt) => {
                  const selected = selectedLayers.includes(opt.name);
                  const isOnlyOneLeft = selected && selectedLayers.length === 1;
                  return (
                    <button
                      key={opt.name}
                      type="button"
                      className="px-2.5 py-1.5 rounded text-[11px] cursor-pointer"
                      style={{
                        background: selected ? v("accent") : v("bg-1"),
                        color: selected ? v("bg-1") : opt.selectable ? v("text-1") : v("text-3"),
                        border: `1px solid ${selected ? v("accent") : opt.selectable ? v("border") : v("bg-4")}`,
                        opacity: opt.selectable ? 1 : 0.55,
                        cursor: opt.selectable ? "pointer" : "not-allowed",
                      }}
                      disabled={!opt.selectable || isOnlyOneLeft}
                      title={!opt.selectable ? `Unavailable: ${opt.reason || "Channel requirements not met"}` : isOnlyOneLeft ? "At least one layer must remain selected" : selected ? "Click to exclude" : "Click to include again"}
                      onClick={() => toggleLayerSelection(layerEditQueueId, opt)}
                    >
                      {opt.name}
                    </button>
                  );
                })}
              </div>
              <div className="rounded p-3" style={{ background: v("bg-1"), border: `1px solid ${v("border")}` }}>
                <div className="text-[10px] mb-1" style={sty.text2}>Current Selection</div>
                <div className="text-[11px]" style={{ ...sty.text1, fontWeight: 600 }}>
                  {selectedLayers.length === selectableOptions.length ? "All layers selected" : selectedLayers.join(", ")}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Fullscreen Preview Modal */}
      {fullscreenPreview && (
        <div className="fixed inset-0 z-[2000] flex flex-col" style={{ background: "rgba(0,0,0,0.9)" }} onClick={() => setFullscreenPreview(false)}>
          <div className="flex items-center justify-between px-4 py-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-[12px]" style={{ color: v("text-1"), fontWeight: 600 }}>
              <Maximize2 size={14} />
              <span>Fullscreen Compare</span>
              {selectedItem && <span style={{ color: v("text-2"), fontWeight: 400 }}>• {selectedItem.fileName}</span>}
              {hasAfterPreview && <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: v("success"), color: "#fff" }}>Before / After</span>}
            </div>
            <button className="p-1.5 rounded cursor-pointer" style={{ background: "transparent", border: `1px solid ${v("border")}`, color: v("text-1") }} onClick={() => setFullscreenPreview(false)}><X size={16} /></button>
          </div>
          <div className="flex-1 flex min-h-0 relative" onClick={(e) => e.stopPropagation()}
            onWheel={handlePreviewWheel}
            onMouseMove={handlePreviewPointerMove}
            onMouseUp={() => { splitDragActiveRef.current = false; }}>
            {renderPreviewCanvas(true)}
            {previewZoom > 1 && (
              <div className="absolute bottom-3 left-3 px-2 py-1 rounded text-[10px] flex items-center gap-1"
                style={{ background: "rgba(0,0,0,0.7)", color: v("text-1") }}>
                <ZoomIn size={12} /> {Math.round(previewZoom * 100)}%
              </div>
            )}
          </div>
          {/* Fullscreen playback controls */}
          <div className="flex items-center gap-2 px-4 py-2 shrink-0" onClick={(e) => e.stopPropagation()} style={{ background: "rgba(0,0,0,0.8)" }}>
            <button className="p-1 rounded cursor-pointer" style={{ background: "transparent", border: "none", color: v("text-1") }} onClick={() => setPlaybackTime(0)}><SkipBack size={14} /></button>
            <button className="p-1 rounded cursor-pointer" style={{ background: "transparent", border: "none", color: v("text-1") }} onClick={() => setIsPlaying(!isPlaying)}>
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button className="p-1 rounded cursor-pointer" style={{ background: "transparent", border: "none", color: v("text-1") }} onClick={() => setPlaybackTime(100)}><SkipForward size={14} /></button>
            <input type="range" className="flex-1 h-1 cursor-pointer" min={0} max={100} value={playbackTime}
              onChange={(e) => setPlaybackTime(Number(e.target.value))} style={{ accentColor: v("accent") }} />
            <span className="text-[11px] min-w-[120px] text-center" style={{ color: v("text-2") }}>{selectedItem ? `${pctToTime(playbackTime)} / ${selectedItem.duration}` : "00:00:00 / 00:00:00"}</span>
            {previewZoom > 1 && (
              <button className="px-2 py-1 rounded text-[10px] cursor-pointer" style={{ background: "transparent", border: `1px solid ${v("border")}`, color: v("text-2") }}
                onClick={() => { setPreviewZoom(1); setPreviewPan({ x: 0.5, y: 0.5 }); }}>
                Reset Zoom              </button>
            )}
          </div>
        </div>
      )}
    </>
  );

  /* ============================================================
     RENDER: TOOLTIP
     ============================================================ */
  const renderTooltip = () => {
    if (!tooltip) return null;
    return (
      <div className="fixed z-[2600] w-[260px] p-3 rounded-lg shadow-xl"
        style={{ left: Math.max(10, tooltip.x), top: tooltip.y, background: v("bg-4"), border: `1px solid ${v("border-lt")}` }}>
        <div className="text-[12px] mb-1" style={{ color: v("accent"), fontWeight: 700 }}>{tooltip.title}</div>
        <div className="text-[11px] leading-relaxed" style={sty.text2}>{tooltip.desc}</div>
        <div className="mt-2 h-16 rounded overflow-hidden" style={{ background: v("bg-0"), border: `1px solid ${v("border")}` }}>
          <div className="h-full flex items-center justify-center text-[10px]" style={sty.text3}>Sample Video</div>
        </div>
      </div>
    );
  };

  /* ============================================================
     MAIN RENDER
     ============================================================ */
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ ...sty.bg1, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: 13 }}>
      {renderGnb()}
      {renderTitleBar()}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {renderLeftPanel()}
        {/* Left resize handle */}
        <div className="w-1 shrink-0 cursor-col-resize group relative hover:bg-blue-500/20 transition-colors"
          style={{ background: "transparent" }}
          onMouseDown={(e) => startResize("left", e, leftPanelWidth)}>
          <div className="absolute inset-y-0 left-0 w-px" style={{ background: v("border") }} />
        </div>
        {renderCenterPanel()}
        {/* Right resize handle */}
        <div className="w-1 shrink-0 cursor-col-resize group relative hover:bg-blue-500/20 transition-colors"
          style={{ background: "transparent" }}
          onMouseDown={(e) => startResize("right", e, rightPanelWidth)}>
          <div className="absolute inset-y-0 right-0 w-px" style={{ background: v("border") }} />
        </div>
        {renderRightPanel()}
      </div>
      {renderModals()}
      {renderTooltip()}
      {/* GNB external link tooltip */}
      {gnbLinkTooltip && (
        <div className="fixed z-[3000] px-2 py-1 rounded text-[10px] pointer-events-none whitespace-nowrap"
          style={{
            background: v("bg-0"), color: v("text-2"), border: `1px solid ${v("border")}`,
            left: gnbLinkTooltip.x, top: gnbLinkTooltip.y, transform: "translate(-50%, -100%)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}>
          <span className="flex items-center gap-1"><Globe size={10} /> {gnbLinkTooltip.text}</span>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SECTION COMPONENT
   ============================================================ */
function Section({ title, icon, children }: { title: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-3" style={{ borderBottom: `1px solid ${v("border")}` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] flex items-center gap-1" style={{ color: v("accent"), fontWeight: 600 }}>
          {typeof title === "string" ? <span>{title}</span> : title}
        </div>
        {icon}
      </div>
      {children}
    </div>
  );
}




