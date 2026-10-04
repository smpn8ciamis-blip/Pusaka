import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "fade-in": {
          "0%": {
            opacity: "0",
            transform: "translateY(10px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "slide-in": {
          "0%": {
            opacity: "0",
            transform: "translateX(-20px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateX(0)",
          },
        },
        "liquid-blob": {
          "0%, 100%": {
            borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
            transform: "rotate(0deg) scale(1)",
          },
          "25%": {
            borderRadius: "30% 60% 70% 40% / 50% 60% 30% 60%",
            transform: "rotate(90deg) scale(1.05)",
          },
          "50%": {
            borderRadius: "50% 60% 30% 60% / 30% 60% 70% 40%",
            transform: "rotate(180deg) scale(1)",
          },
          "75%": {
            borderRadius: "60% 40% 60% 30% / 70% 30% 50% 60%",
            transform: "rotate(270deg) scale(1.05)",
          },
        },
        "liquid-blob-reverse": {
          "0%, 100%": {
            borderRadius: "40% 60% 70% 30% / 40% 70% 30% 60%",
            transform: "rotate(0deg) scale(1)",
          },
          "25%": {
            borderRadius: "60% 30% 40% 70% / 60% 40% 60% 30%",
            transform: "rotate(-90deg) scale(0.95)",
          },
          "50%": {
            borderRadius: "30% 60% 60% 40% / 70% 30% 40% 60%",
            transform: "rotate(-180deg) scale(1)",
          },
          "75%": {
            borderRadius: "70% 40% 30% 60% / 40% 60% 70% 30%",
            transform: "rotate(-270deg) scale(0.95)",
          },
        },
        "liquid-ripple": {
          "0%": {
            transform: "scale(0.8)",
            opacity: "0.8",
          },
          "100%": {
            transform: "scale(1.5)",
            opacity: "0",
          },
        },
        "liquid-ripple-delay": {
          "0%": {
            transform: "scale(1)",
            opacity: "0.3",
          },
          "100%": {
            transform: "scale(2)",
            opacity: "0",
          },
        },
        "water-wave": {
          "0%": {
            transform: "translateX(0)",
          },
          "100%": {
            transform: "translateX(-50%)",
          },
        },
        "water-wave-reverse": {
          "0%": {
            transform: "translateX(-50%)",
          },
          "100%": {
            transform: "translateX(0)",
          },
        },
        "liquid-wave": {
          "0%": {
            transform: "translateX(-100%)",
          },
          "100%": {
            transform: "translateX(100%)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-in",
        "slide-in": "slide-in 0.5s ease-out",
        "liquid-blob": "liquid-blob 4s ease-in-out infinite",
        "liquid-blob-reverse": "liquid-blob-reverse 5s ease-in-out infinite",
        "liquid-ripple": "liquid-ripple 2s ease-out infinite",
        "liquid-ripple-delay": "liquid-ripple-delay 2s ease-out infinite 0.5s",
        "liquid-wave": "liquid-wave 2s ease-in-out infinite",
        "water-wave": "water-wave 2s linear infinite",
        "water-wave-reverse": "water-wave-reverse 3s linear infinite",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, hsl(217, 91%, 60%) 0%, hsl(262, 83%, 58%) 50%, hsl(243, 75%, 59%) 100%)",
        "gradient-hero": "linear-gradient(135deg, hsl(217, 91%, 60%) 0%, hsl(262, 83%, 58%) 50%, hsl(243, 75%, 59%) 100%)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
