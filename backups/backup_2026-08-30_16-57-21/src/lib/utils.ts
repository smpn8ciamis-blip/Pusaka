import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert name to title case while preserving academic titles correctly
 * Handles Indonesian academic titles like S.Pd., M.Pd., Dr., Prof., etc.
 */
export function toTitleCase(name: string | null | undefined): string {
  if (!name) return "";
  
  // Academic title patterns (case-insensitive matching, correct output format)
  const academicTitles: Record<string, string> = {
    // Prefix titles
    'prof': 'Prof.',
    'prof.': 'Prof.',
    'dr': 'Dr.',
    'dr.': 'Dr.',
    'drs': 'Drs.',
    'drs.': 'Drs.',
    'dra': 'Dra.',
    'dra.': 'Dra.',
    'ir': 'Ir.',
    'ir.': 'Ir.',
    'h': 'H.',
    'h.': 'H.',
    'hj': 'Hj.',
    'hj.': 'Hj.',
    'kh': 'KH.',
    'kh.': 'KH.',
    'ns': 'Ns.',
    'ns.': 'Ns.',
    'apt': 'Apt.',
    'apt.': 'Apt.',
    // Suffix titles - Bachelor degrees
    's.pd': 'S.Pd.',
    's.pd.': 'S.Pd.',
    's.kom': 'S.Kom.',
    's.kom.': 'S.Kom.',
    's.e': 'S.E.',
    's.e.': 'S.E.',
    's.h': 'S.H.',
    's.h.': 'S.H.',
    's.t': 'S.T.',
    's.t.': 'S.T.',
    's.si': 'S.Si.',
    's.si.': 'S.Si.',
    's.sos': 'S.Sos.',
    's.sos.': 'S.Sos.',
    's.ag': 'S.Ag.',
    's.ag.': 'S.Ag.',
    's.ip': 'S.IP.',
    's.ip.': 'S.IP.',
    's.ked': 'S.Ked.',
    's.ked.': 'S.Ked.',
    's.kep': 'S.Kep.',
    's.kep.': 'S.Kep.',
    's.farm': 'S.Farm.',
    's.farm.': 'S.Farm.',
    's.psi': 'S.Psi.',
    's.psi.': 'S.Psi.',
    's.sn': 'S.Sn.',
    's.sn.': 'S.Sn.',
    's.hum': 'S.Hum.',
    's.hum.': 'S.Hum.',
    's.i.kom': 'S.I.Kom.',
    's.i.kom.': 'S.I.Kom.',
    // Suffix titles - Master degrees  
    'm.pd': 'M.Pd.',
    'm.pd.': 'M.Pd.',
    'm.kom': 'M.Kom.',
    'm.kom.': 'M.Kom.',
    'm.m': 'M.M.',
    'm.m.': 'M.M.',
    'm.si': 'M.Si.',
    'm.si.': 'M.Si.',
    'm.h': 'M.H.',
    'm.h.': 'M.H.',
    'm.t': 'M.T.',
    'm.t.': 'M.T.',
    'm.sc': 'M.Sc.',
    'm.sc.': 'M.Sc.',
    'm.a': 'M.A.',
    'm.a.': 'M.A.',
    'm.kes': 'M.Kes.',
    'm.kes.': 'M.Kes.',
    'm.hum': 'M.Hum.',
    'm.hum.': 'M.Hum.',
    'm.ag': 'M.Ag.',
    'm.ag.': 'M.Ag.',
    'm.sn': 'M.Sn.',
    'm.sn.': 'M.Sn.',
    'm.psi': 'M.Psi.',
    'm.psi.': 'M.Psi.',
    // Doctoral degrees
    'ph.d': 'Ph.D.',
    'ph.d.': 'Ph.D.',
    'phd': 'Ph.D.',
    // Other common titles
    'se': 'S.E.',
    'se.': 'S.E.',
    'sh': 'S.H.',
    'sh.': 'S.H.',
    'st': 'S.T.',
    'st.': 'S.T.',
    'mm': 'M.M.',
    'mm.': 'M.M.',
    'mba': 'MBA',
    'm.b.a': 'MBA',
    'm.b.a.': 'MBA',
    'b.sc': 'B.Sc.',
    'b.sc.': 'B.Sc.',
    'ners': 'Ners',
  };

  // Split by comma first to handle "Name, Title" format
  const parts = name.split(',').map(part => part.trim());
  
  const processedParts = parts.map(part => {
    // Split by spaces
    const words = part.split(/\s+/);
    
    return words.map(word => {
      // Check if word is an academic title (case-insensitive)
      const lowerWord = word.toLowerCase();
      if (academicTitles[lowerWord]) {
        return academicTitles[lowerWord];
      }
      
      // Check for compound titles with dots (like S.Pd or M.Pd)
      const wordWithoutTrailingDot = lowerWord.replace(/\.+$/, '');
      if (academicTitles[wordWithoutTrailingDot]) {
        return academicTitles[wordWithoutTrailingDot];
      }
      
      // Check if the word looks like a degree (contains dots between letters)
      if (/^[a-z]\.([a-z]\.?)+$/i.test(word)) {
        // It's likely a degree, try to match or format it
        const normalized = word.toLowerCase();
        if (academicTitles[normalized]) {
          return academicTitles[normalized];
        }
        // Return as-is with proper capitalization
        return word.toUpperCase().replace(/([A-Z])\.?/g, '$1.');
      }
      
      // Regular name word - convert to title case
      if (word.length > 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    }).join(' ');
  });
  
  return processedParts.join(', ');
}
