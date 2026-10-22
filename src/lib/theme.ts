//-----------------------------------------------------------------------
// Theme — light by default (the porcelain stage); the glossy switch in
// the top bar is the only control, so the OS appearance never flips it.
//-----------------------------------------------------------------------

import { createContext, useContext, useEffect, useState } from "react";

interface ThemeState {
    isDark: boolean;
    toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeState>({ isDark: false, toggleTheme: () => {} });

export function useThemeContext(): ThemeState {
    return useContext(ThemeContext);
}

/** Holds the theme and keeps the `dark` class on <html> in sync. */
export function useAppTheme(): ThemeState {
    const [isDark, setIsDark] = useState(false);
    useEffect(() => {
        document.documentElement.classList.toggle("dark", isDark);
    }, [isDark]);
    return { isDark, toggleTheme: () => setIsDark((d) => !d) };
}
