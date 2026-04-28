export interface QueueItem {
  fileName: string;
  sourcePath: string;
  res: string;
  fps: string;
  duration: string;
  codec: string;
  container: string;
  bitrate: string;
  size: string;
  timecode: string;
  color: string;
  scan: string;
  preset: string;
  mainModel: string;
  subModels: string[];
  status: "ready" | "processing" | "done" | "failed";
  progress?: number;
  outputPath: string;
  type?: "video" | "sequence" | "exr";
  layerMode?: "Single" | "Multi";
  selectedLayers?: string[];
  colorMeta: { primaries: string; transfer: string; bitDepth: string; chroma: string; matrix: string; mastering: string };
  motionMeta: { avg: string; sceneCuts: string; dropped: string; duplicated: string; jitter: string; series: number[] };
  encodeMeta: { gop: string; qpAvg: string; qpRange: string; bpppf: string; bitrateSeries: number[]; qpDist: { I: number; P: number; B: number } };
  audioMeta: { lufs: string; truePeak: string; lra: string; sampleRate: string; channels: string; spectrumL: number[]; spectrumR: number[] };
  modelSettings?: ModelSettings;
}

export type UpscalerLevel = "off" | "2x" | "4x";

export interface ModelSettings {
  upscaler: UpscalerLevel;
  edgeEnhancement: boolean;
  deinterlace: boolean;
}

export const UPSCALER_OPTIONS: { value: UpscalerLevel; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "2x", label: "2x" },
  { value: "4x", label: "4x" },
];

export function getModelUpscaleFactor(level: UpscalerLevel): 1 | 2 | 4 {
  if (level === "4x") return 4;
  if (level === "2x") return 2;
  return 1;
}

export interface EventLog {
  time: string;
  level: "INFO" | "WARN" | "ERROR";
  source: string;
  message: string;
}

export interface SourceFile {
  id: string;
  name: string;
  path?: string;
  res: string;
  fps?: string;
  duration?: string;
  date?: string;
  frames?: string;
  layer?: string;
  selected?: string;
  type: "video" | "sequence" | "exr";
  folder: string;
}

export interface PresetItem {
  id: string;
  name: string;
  modelSettings: ModelSettings;
  exportSettings: PresetExportSettings;
}

export interface PresetExportSettings {
  codec: string;
  container: string;
  frameRate: string;
  audio: string;
  profile: string;
  bitrate: string;
  quality: string;
  resize: "Original" | "2x" | "custom";
  customRes?: string;
}

export function defaultPresetExportSettings(): PresetExportSettings {
  return {
    codec: "H.264",
    container: "MP4",
    frameRate: "Original",
    audio: "AAC",
    profile: "High",
    bitrate: "Auto",
    quality: "Best",
    resize: "Original",
  };
}

export interface FolderNode {
  id: string;
  name: string;
  icon: "local" | "network" | "external";
  children?: FolderNode[];
}

export function defaultModelSettings(): ModelSettings {
  return { upscaler: "off", edgeEnhancement: false, deinterlace: false };
}

export function buildModelSettingsFromLegacy(d: QueueItem): ModelSettings {
  const cfg = defaultModelSettings();
  if (d.mainModel === "upscale-g") cfg.upscaler = "2x";
  else if (d.mainModel === "upscale-l") cfg.upscaler = "4x";
  else if (d.mainModel === "sharpclear") cfg.edgeEnhancement = true;
  cfg.deinterlace = (d.subModels || []).includes("deinterlace");
  return cfg;
}

export function formatModelLabel(cfg: ModelSettings): string {
  const parts: string[] = [];
  if (cfg.upscaler === "2x") parts.push("2x Upscale");
  else if (cfg.upscaler === "4x") parts.push("4x Upscale");
  if (cfg.edgeEnhancement) parts.push("Edge Enhancement");
  if (cfg.deinterlace) parts.push("De-interlace");
  return parts.join(", ") || "-";
}

// ── Folder tree data ──
export const folderTree: FolderNode[] = [
  {
    id: "c-drive",
    name: "Local Drive (C:)",
    icon: "local",
    children: [
      { id: "c-videos", name: "Videos", icon: "local" },
      { id: "c-projects", name: "Projects", icon: "local" },
    ],
  },
  { id: "net-drive", name: "Network Drive (J:)", icon: "network" },
  { id: "ext-drive", name: "External Drive (E:)", icon: "external" },
];

// ── Source files per folder ──
export const sourceFilesByFolder: Record<string, SourceFile[]> = {
  "c-drive": [
    { id: "sv1", name: "sample_video.mp4", res: "1920x1080", fps: "29.97", duration: "00:05:32", type: "video", folder: "c-drive" },
    { id: "sv2", name: "test_clip.mov", res: "3840x2160", fps: "24", duration: "00:02:15", type: "video", folder: "c-drive" },
    { id: "sv3", name: "demo_footage.mxf", res: "1280x720", fps: "30", duration: "00:10:00", type: "video", folder: "c-drive" },
    { id: "ss1", name: "scene_001_[0001-0240].tif", res: "4096x2160", date: "2026-01-15", frames: "240", type: "sequence", folder: "c-drive" },
    { id: "sdpx1", name: "city_plate_[0001-0120].dpx", res: "2048x1080", date: "2026-02-03", frames: "120", type: "sequence", folder: "c-drive" },
    { id: "se1", name: "comp_v02_[0001-0120].exr", res: "4096x2160", layer: "Multi", selected: "Beauty", type: "exr", folder: "c-drive" },
  ],
  "c-videos": [
    { id: "cv1", name: "interview_final.mp4", res: "1920x1080", fps: "30", duration: "00:45:12", type: "video", folder: "c-videos" },
    { id: "cv2", name: "product_shoot_v3.mov", res: "4096x2160", fps: "23.976", duration: "00:03:40", type: "video", folder: "c-videos" },
    { id: "cv3", name: "BTS_raw_001.mp4", res: "1920x1080", fps: "59.94", duration: "00:12:08", type: "video", folder: "c-videos" },
    { id: "cv4", name: "drone_aerial.mov", res: "3840x2160", fps: "29.97", duration: "00:08:55", type: "video", folder: "c-videos" },
    { id: "cvs1", name: "interview_stills_[0001-0096].tif", res: "1920x1080", date: "2026-02-20", frames: "96", type: "sequence", folder: "c-videos" },
    { id: "cvs2", name: "product_plates_[0001-0150].png", res: "4096x2160", date: "2026-02-21", frames: "150", type: "sequence", folder: "c-videos" },
    { id: "cve1", name: "interview_vfx_[0001-0200].exr", res: "1920x1080", layer: "Multi", selected: "Beauty", type: "exr", folder: "c-videos" },
    { id: "cve2", name: "drone_grade_[0001-0300].exr", res: "3840x2160", layer: "Single", selected: "RGBA", type: "exr", folder: "c-videos" },
  ],
  "c-projects": [
    { id: "cp1", name: "project_alpha_cut1.mp4", res: "3840x2160", fps: "24", duration: "00:22:30", type: "video", folder: "c-projects" },
    { id: "cp2", name: "vfx_comp_[0001-0480].exr", res: "4096x2160", layer: "Multi", selected: "Beauty", type: "exr", folder: "c-projects" },
    { id: "cp3", name: "color_grade_ref.mov", res: "1920x1080", fps: "24", duration: "00:01:00", type: "video", folder: "c-projects" },
    { id: "cs1", name: "plate_bg_[0001-0120].tif", res: "4096x2160", date: "2026-02-10", frames: "120", type: "sequence", folder: "c-projects" },
    { id: "cs2", name: "plate_fg_[0001-0360].tif", res: "4096x2160", date: "2026-02-11", frames: "360", type: "sequence", folder: "c-projects" },
    { id: "cdpx1", name: "hero_fx_[1001-1120].dpx", res: "2048x1556", date: "2026-02-12", frames: "120", type: "sequence", folder: "c-projects" },
  ],
  "net-drive": [
    { id: "nv1", name: "client_review_v2.mp4", res: "1920x1080", fps: "29.97", duration: "00:15:20", type: "video", folder: "net-drive" },
    { id: "nv2", name: "broadcast_master.mxf", res: "1920x1080", fps: "29.97", duration: "00:58:30", type: "video", folder: "net-drive" },
    { id: "ns1", name: "anim_render_[0001-0600].exr", res: "2048x1080", layer: "Single", selected: "RGBA", type: "exr", folder: "net-drive" },
    { id: "ns2", name: "broadcast_stills_[0001-0180].tif", res: "1920x1080", date: "2026-01-28", frames: "180", type: "sequence", folder: "net-drive" },
    { id: "ns3", name: "client_plates_[0001-0400].png", res: "1920x1080", date: "2026-02-05", frames: "400", type: "sequence", folder: "net-drive" },
    { id: "ne1", name: "broadcast_comp_[0001-0720].exr", res: "1920x1080", layer: "Multi", selected: "Beauty", type: "exr", folder: "net-drive" },
  ],
  "ext-drive": [
    { id: "ev1", name: "wedding_ceremony.mp4", res: "3840x2160", fps: "30", duration: "01:32:15", type: "video", folder: "ext-drive" },
    { id: "ev2", name: "travel_log_bali.mov", res: "3840x2160", fps: "24", duration: "00:25:40", type: "video", folder: "ext-drive" },
    { id: "ev3", name: "timelapse_sunset.mp4", res: "7680x4320", fps: "30", duration: "00:02:00", type: "video", folder: "ext-drive" },
    { id: "es1", name: "startrail_[0001-1800].tif", res: "6000x4000", date: "2026-01-20", frames: "1800", type: "sequence", folder: "ext-drive" },
    { id: "es2", name: "wedding_photos_[0001-0500].jpg", res: "4000x3000", date: "2026-03-01", frames: "500", type: "sequence", folder: "ext-drive" },
    { id: "ee1", name: "timelapse_comp_[0001-0240].exr", res: "7680x4320", layer: "Single", selected: "RGBA", type: "exr", folder: "ext-drive" },
    { id: "ee2", name: "travel_grade_[0001-0480].exr", res: "3840x2160", layer: "Multi", selected: "Beauty", type: "exr", folder: "ext-drive" },
  ],
};

// ── Queue initial data ──
export const initialQueueData: Record<string, QueueItem> = {
  q0: {
    fileName: "sample_video.mp4", sourcePath: "C:\\Input\\sample_video.mp4", res: "1920x1080", fps: "29.97", duration: "00:05:32",
    codec: "H.264", container: "MP4", bitrate: "18.0 Mbps", size: "1.2 GB",
    timecode: "00:00:00:00", color: "Rec.709", scan: "Progressive",
    preset: "4K Upscale", mainModel: "upscale-g", subModels: [],
    status: "ready", outputPath: "C:\\Input\\sample_video_2x Upscale.mp4", type: "video",
    colorMeta: { primaries: "BT.709", transfer: "BT.709", bitDepth: "8-bit", chroma: "4:2:0", matrix: "BT.709", mastering: "SDR" },
    motionMeta: { avg: "0.41", sceneCuts: "15", dropped: "0", duplicated: "1", jitter: "1.6 ms", series: [18, 22, 26, 20, 30, 24, 28, 33, 31, 27, 25, 29, 34, 32, 30, 22] },
    encodeMeta: { gop: "M=3, N=60", qpAvg: "22.8", qpRange: "17-30", bpppf: "0.182", bitrateSeries: [10, 11, 12, 14, 16, 15, 13, 12, 17, 18, 15, 14, 12, 11, 10, 9], qpDist: { I: 18, P: 56, B: 26 } },
    audioMeta: { lufs: "-16.2", truePeak: "-1.1 dBTP", lra: "6.8 LU", sampleRate: "48 kHz", channels: "2.0 Stereo", spectrumL: [22, 30, 36, 28, 44, 38, 26, 18, 16, 24, 30, 28], spectrumR: [20, 28, 34, 26, 42, 36, 24, 16, 14, 22, 28, 26] },
  },
  q1: {
    fileName: "test_clip.mov", sourcePath: "C:\\Input\\test_clip.mov", res: "3840x2160", fps: "24", duration: "00:02:15",
    codec: "ProRes", container: "MOV", bitrate: "120.0 Mbps", size: "2.8 GB",
    timecode: "01:00:00:00", color: "Rec.709", scan: "Progressive",
    preset: "Denoise + Sharpen", mainModel: "sharpclear", subModels: ["deinterlace"],
    status: "processing", progress: 45, outputPath: "C:\\Input\\test_clip_SharpClear,De-interlace.mov", type: "video",
    colorMeta: { primaries: "BT.2020", transfer: "PQ", bitDepth: "10-bit", chroma: "4:2:2", matrix: "BT.2020nc", mastering: "HDR10 1000nit" },
    motionMeta: { avg: "0.33", sceneCuts: "9", dropped: "0", duplicated: "0", jitter: "0.9 ms", series: [12, 16, 20, 18, 15, 14, 19, 23, 25, 21, 18, 16, 15, 17, 18, 20] },
    encodeMeta: { gop: "All-I", qpAvg: "11.4", qpRange: "8-16", bpppf: "0.421", bitrateSeries: [110, 118, 122, 130, 126, 119, 124, 128, 133, 129, 121, 116, 112, 114, 117, 120], qpDist: { I: 100, P: 0, B: 0 } },
    audioMeta: { lufs: "-20.4", truePeak: "-2.7 dBTP", lra: "10.3 LU", sampleRate: "48 kHz", channels: "5.1", spectrumL: [16, 22, 30, 40, 38, 34, 28, 20, 14, 12, 10, 8], spectrumR: [15, 21, 29, 39, 37, 33, 27, 19, 13, 11, 9, 7] },
  },
  q2: {
    fileName: "demo_footage.mxf", sourcePath: "C:\\Input\\demo_footage.mxf", res: "1280x720", fps: "30", duration: "00:10:00",
    codec: "MPEG2", container: "MXF", bitrate: "5.2 Mbps", size: "1.0 GB",
    timecode: "00:00:00:00", color: "YUV 4:2:0", scan: "Progressive",
    preset: "HD Enhancement", mainModel: "upscale-g", subModels: [],
    status: "done", outputPath: "C:\\Input\\demo_footage_2x Upscale.mp4", type: "video",
    colorMeta: { primaries: "SMPTE 170M", transfer: "BT.601", bitDepth: "8-bit", chroma: "4:2:0", matrix: "BT.601", mastering: "SDR" },
    motionMeta: { avg: "0.52", sceneCuts: "22", dropped: "3", duplicated: "6", jitter: "2.8 ms", series: [28, 26, 30, 34, 38, 40, 35, 31, 29, 33, 37, 39, 42, 36, 32, 30] },
    encodeMeta: { gop: "M=3, N=30", qpAvg: "27.2", qpRange: "20-37", bpppf: "0.094", bitrateSeries: [4, 5, 6, 7, 8, 9, 8, 7, 6, 5, 6, 7, 8, 9, 8, 7], qpDist: { I: 22, P: 48, B: 30 } },
    audioMeta: { lufs: "-18.9", truePeak: "-0.9 dBTP", lra: "5.2 LU", sampleRate: "48 kHz", channels: "2.0 Stereo", spectrumL: [30, 34, 36, 32, 26, 22, 18, 16, 14, 18, 22, 26], spectrumR: [28, 32, 35, 31, 25, 21, 17, 15, 13, 17, 21, 25] },
  },
  q3: {
    fileName: "scene_raw.ts", sourcePath: "C:\\Input\\scene_raw.ts", res: "1920x1080", fps: "29.97", duration: "00:08:45",
    codec: "H.264", container: "TS", bitrate: "8.5 Mbps", size: "800 MB",
    timecode: "00:00:00:00", color: "Rec.709", scan: "Interlaced",
    preset: "4K Upscale", mainModel: "upscale-g", subModels: ["deinterlace"],
    status: "failed", outputPath: "C:\\Input\\scene_raw_2x Upscale,De-interlace.ts", type: "video",
    colorMeta: { primaries: "BT.709", transfer: "BT.709", bitDepth: "8-bit", chroma: "4:2:0", matrix: "BT.709", mastering: "SDR" },
    motionMeta: { avg: "0.67", sceneCuts: "31", dropped: "8", duplicated: "11", jitter: "4.3 ms", series: [35, 42, 48, 51, 44, 39, 46, 53, 50, 47, 42, 38, 40, 45, 49, 52] },
    encodeMeta: { gop: "M=3, N=60", qpAvg: "30.7", qpRange: "24-41", bpppf: "0.078", bitrateSeries: [6, 7, 8, 10, 11, 10, 9, 8, 10, 12, 11, 9, 8, 7, 6, 7], qpDist: { I: 16, P: 45, B: 39 } },
    audioMeta: { lufs: "-14.8", truePeak: "-0.2 dBTP", lra: "3.9 LU", sampleRate: "44.1 kHz", channels: "2.0 Stereo", spectrumL: [36, 40, 44, 42, 38, 35, 32, 28, 24, 22, 20, 18], spectrumR: [35, 39, 43, 41, 37, 34, 31, 27, 23, 21, 19, 17] },
  },
};

export const initialEventLogs: EventLog[] = [
  { time: "2026-02-26 09:15:20", level: "INFO", source: "QUEUE", message: "sample_video.mp4 added to queue" },
  { time: "2026-02-26 09:16:01", level: "WARN", source: "ENCODER", message: "Detected 2 dropped frames while processing scene_raw.ts" },
  { time: "2026-02-26 09:16:45", level: "ERROR", source: "CLOUD", message: "Cloud export authentication token expired" },
];

export const modelTooltipInfo: Record<string, { title: string; desc: string }> = {
  upscaler: { title: "Upscaler", desc: "Increases output resolution by 2x or 4x." },
  edgeEnhancement: { title: "Edge Enhancement", desc: "Improves edge clarity and texture detail." },
  deinterlace: { title: "De-interlace", desc: "Converts interlaced footage to progressive frames." },
};

export const initialPresets: PresetItem[] = [
  { id: "p1", name: "2x Upscale", modelSettings: { upscaler: "2x", edgeEnhancement: false, deinterlace: false }, exportSettings: { codec: "H.264", container: "MP4", frameRate: "Original", audio: "AAC", profile: "High", bitrate: "Auto", quality: "Best", resize: "2x" } },
  { id: "p2", name: "4x Upscale", modelSettings: { upscaler: "4x", edgeEnhancement: false, deinterlace: false }, exportSettings: { codec: "H.264", container: "MP4", frameRate: "Original", audio: "AAC", profile: "High", bitrate: "Auto", quality: "Best", resize: "Original" } },
  { id: "p3", name: "Edge Enhance", modelSettings: { upscaler: "off", edgeEnhancement: true, deinterlace: false }, exportSettings: { codec: "H.265", container: "MOV", frameRate: "Original", audio: "AAC", profile: "High", bitrate: "Auto", quality: "Best", resize: "Original" } },
  { id: "p4", name: "Broadcast Restore", modelSettings: { upscaler: "2x", edgeEnhancement: true, deinterlace: true }, exportSettings: { codec: "ProRes", container: "MOV", frameRate: "Original", audio: "AAC", profile: "High", bitrate: "Auto", quality: "Best", resize: "Original" } },
];

export function makeDefaultQueueItem(sf: SourceFile): QueueItem {
  const ext = sf.name.split(".").pop()?.toUpperCase() || "MP4";
  const codecMap: Record<string, string> = { MP4: "H.264", MOV: "ProRes", MXF: "MPEG2", TS: "H.264", TIF: "TIFF", TIFF: "TIFF", DPX: "DPX", EXR: "OpenEXR" };
  const containerMap: Record<string, string> = { MP4: "MP4", MOV: "MOV", MXF: "MXF", TS: "TS", TIF: "Image Seq", TIFF: "Image Seq", DPX: "Image Seq", EXR: "EXR" };
  const folderBaseMap: Record<string, string> = {
    "c-drive": "C:\\Input",
    "c-videos": "C:\\Videos",
    "c-projects": "C:\\Projects",
    "net-drive": "J:\\Media",
    "ext-drive": "E:\\Media",
  };
  const sourcePath = sf.path || `${folderBaseMap[sf.folder] || "C:\\Input"}\\${sf.name}`;
  const outputDir = sourcePath.includes("\\") ? sourcePath.slice(0, sourcePath.lastIndexOf("\\")) : "C:\\Output";
  const baseName = sf.name.replace(/\.[^.]+$/, "");
  const outputPath = `${outputDir}\\${baseName}_2x Upscale.${ext.toLowerCase()}`;
  return {
    fileName: sf.name,
    sourcePath,
    res: sf.res,
    fps: sf.fps || "24",
    duration: sf.duration || `${sf.frames || 0} frames`,
    codec: codecMap[ext] || "H.264",
    container: containerMap[ext] || "MP4",
    bitrate: "—",
    size: "—",
    timecode: "00:00:00:00",
    color: "Rec.709",
    scan: "Progressive",
    preset: "4K Upscale",
    mainModel: "upscale-g",
    subModels: [],
    status: "ready",
    outputPath,
    type: sf.type,
    layerMode: sf.layer === "Single" ? "Single" : sf.type === "exr" ? "Multi" : undefined,
    selectedLayers: sf.selected ? [sf.selected] : undefined,
    colorMeta: { primaries: "BT.709", transfer: "BT.709", bitDepth: "8-bit", chroma: "4:2:0", matrix: "BT.709", mastering: "SDR" },
    motionMeta: { avg: "—", sceneCuts: "—", dropped: "0", duplicated: "0", jitter: "—", series: [] },
    encodeMeta: { gop: "—", qpAvg: "—", qpRange: "—", bpppf: "—", bitrateSeries: [], qpDist: { I: 0, P: 0, B: 0 } },
    audioMeta: { lufs: "—", truePeak: "—", lra: "—", sampleRate: "—", channels: "—", spectrumL: [], spectrumR: [] },
  };
}
