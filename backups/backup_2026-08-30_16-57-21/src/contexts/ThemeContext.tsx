import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'morning' | 'evening';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  autoTheme: boolean;
  setAutoTheme: (auto: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [autoTheme, setAutoTheme] = useState(true);

  // Auto theme berdasarkan waktu
  useEffect(() => {
    const updateThemeByTime = () => {
      if (!autoTheme) return;

      const hour = new Date().getHours();
      let newTheme: Theme;

      if (hour >= 5 && hour < 10) {
        newTheme = 'morning'; // Pagi: tema cerah & fresh
      } else if (hour >= 10 && hour < 17) {
        newTheme = 'light'; // Siang: tema standar terang
      } else if (hour >= 17 && hour < 20) {
        newTheme = 'evening'; // Sore: tema warm
      } else {
        newTheme = 'dark'; // Malam: tema gelap
      }

      console.log(`[Theme] Current hour: ${hour}, Setting theme: ${newTheme}`);
      setTheme(newTheme);
      applyTheme(newTheme);
    };

    // Langsung jalankan saat mount
    updateThemeByTime();
    const interval = setInterval(updateThemeByTime, 60000); // Check setiap menit

    return () => clearInterval(interval);
  }, [autoTheme]);

  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;
    
    // Hapus semua class tema
    root.classList.remove('light', 'dark', 'morning', 'evening');
    
    // Tambah class tema baru
    root.classList.add(newTheme);
    console.log(`[Theme] Applied theme class: ${newTheme}, Current classes:`, root.className);
  };

  const handleSetTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    setAutoTheme(false);
    applyTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme, autoTheme, setAutoTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
