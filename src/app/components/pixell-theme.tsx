import React, { createContext, useContext, useState, useCallback } from "react";

export type ThemeName = "black" | "white" | "gray";

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  vars: Record<string, string>;
}

const themeMap: Record<ThemeName, Record<string, string>> = {
  black: {
    "--px-bg-0": "#080808",
    "--px-bg-1": "#111111",
    "--px-bg-2": "#1a1a1a",
    "--px-bg-3": "#222222",
    "--px-bg-4": "#2a2a2a",
    "--px-bg-hover": "#333333",
    "--px-border": "#262626",
    "--px-border-lt": "#383838",
    "--px-text-1": "#f0f0f0",
    "--px-text-2": "#8a8a8a",
    "--px-text-3": "#555555",
    "--px-accent": "#ffffff",
    "--px-accent-h": "#d0d0d0",
    "--px-accent-bg": "rgba(255,255,255,0.08)",
    "--px-success": "#22c55e",
    "--px-error": "#ef4444",
    "--px-warning": "#f59e0b",
    "--px-info": "#3b82f6",
    "--px-preview-bg": "#000000",
  },
  white: {
    "--px-bg-0": "#f5f5f5",
    "--px-bg-1": "#ffffff",
    "--px-bg-2": "#fafafa",
    "--px-bg-3": "#f0f0f0",
    "--px-bg-4": "#e8e8e8",
    "--px-bg-hover": "#e0e0e0",
    "--px-border": "#dcdcdc",
    "--px-border-lt": "#cccccc",
    "--px-text-1": "#111111",
    "--px-text-2": "#666666",
    "--px-text-3": "#999999",
    "--px-accent": "#111111",
    "--px-accent-h": "#333333",
    "--px-accent-bg": "rgba(0,0,0,0.06)",
    "--px-success": "#16a34a",
    "--px-error": "#dc2626",
    "--px-warning": "#d97706",
    "--px-info": "#2563eb",
    "--px-preview-bg": "#e0e0e0",
  },
  gray: {
    "--px-bg-0": "#282828",
    "--px-bg-1": "#323232",
    "--px-bg-2": "#3a3a3a",
    "--px-bg-3": "#434343",
    "--px-bg-4": "#4c4c4c",
    "--px-bg-hover": "#575757",
    "--px-border": "#4e4e4e",
    "--px-border-lt": "#5e5e5e",
    "--px-text-1": "#ececec",
    "--px-text-2": "#a0a0a0",
    "--px-text-3": "#777777",
    "--px-accent": "#e0e0e0",
    "--px-accent-h": "#c8c8c8",
    "--px-accent-bg": "rgba(255,255,255,0.07)",
    "--px-success": "#22c55e",
    "--px-error": "#ef4444",
    "--px-warning": "#f59e0b",
    "--px-info": "#3b82f6",
    "--px-preview-bg": "#1a1a1a",
  },
};

const ThemeContext = createContext<ThemeContextType>({
  theme: "black",
  setTheme: () => {},
  vars: themeMap.black,
});

export function usePixellTheme() {
  return useContext(ThemeContext);
}

export function PixellThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("black");
  const setTheme = useCallback((t: ThemeName) => setThemeState(t), []);
  const vars = themeMap[theme];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, vars }}>
      <div style={vars as React.CSSProperties} className="size-full">
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function ThemeSwitcher() {
  const { theme, setTheme } = usePixellTheme();
  const options: { value: ThemeName; label: string }[] = [
    { value: "black", label: "Black" },
    { value: "white", label: "White" },
    { value: "gray", label: "Gray" },
  ];

  return (
    <div className="flex items-center gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => setTheme(o.value)}
          className="px-2 py-1 rounded text-[10px] transition-colors cursor-pointer"
          style={{
            background: theme === o.value ? "var(--px-accent)" : "transparent",
            color: theme === o.value ? "var(--px-bg-1)" : "var(--px-text-2)",
            border: `1px solid ${theme === o.value ? "var(--px-accent)" : "var(--px-border)"}`,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
