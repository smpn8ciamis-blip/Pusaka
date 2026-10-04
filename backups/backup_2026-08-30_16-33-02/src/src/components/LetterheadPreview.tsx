import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye } from 'lucide-react';

interface LetterheadPreviewProps {
  settings: {
    school_name: string;
    district_name?: string;
    district_font_size: number;
    district_font_style: string;
    district_line_spacing: number;
    school_address?: string;
    school_phone?: string;
    logo_url?: string;
    logo_width: number;
    logo_height: number;
    logo_position_x: number;
    logo_position_y: number;
    right_logo_url?: string;
    right_logo_width: number;
    right_logo_height: number;
    right_logo_position_x: number;
    right_logo_position_y: number;
    header_font_size: number;
    header_font_style: string;
    school_line_spacing: number;
    subheader_font_size: number;
    show_address: boolean;
    show_phone: boolean;
    watermark_url?: string;
    watermark_opacity: number;
    watermark_size: number;
    watermark_position: string;
    watermark_enabled: boolean;
  };
  logoFile?: File | null;
  rightLogoFile?: File | null;
  watermarkFile?: File | null;
}

export const LetterheadPreview = ({ settings, logoFile, rightLogoFile, watermarkFile }: LetterheadPreviewProps) => {
  const logoSrc = logoFile ? URL.createObjectURL(logoFile) : settings.logo_url;
  const rightLogoSrc = rightLogoFile ? URL.createObjectURL(rightLogoFile) : settings.right_logo_url;
  const watermarkSrc = watermarkFile ? URL.createObjectURL(watermarkFile) : settings.watermark_url;
  
  // Convert mm to pixels (assuming 96 DPI: 1mm = 3.78px)
  const mmToPx = (mm: number) => mm * 3.78;
  
  // A4 width in px at 96 DPI
  const pageWidthPx = 794; // 210mm * 3.78
  
  const logoWidthPx = mmToPx(settings.logo_width);
  const logoHeightPx = mmToPx(settings.logo_height);
  const logoXPx = mmToPx(settings.logo_position_x);
  const logoYPx = mmToPx(settings.logo_position_y);
  
  const rightLogoWidthPx = mmToPx(settings.right_logo_width);
  const rightLogoHeightPx = mmToPx(settings.right_logo_height);
  const rightLogoXPx = mmToPx(settings.right_logo_position_x);
  const rightLogoYPx = mmToPx(settings.right_logo_position_y);

  // Calculate text position with line spacing
  const districtLineHeight = settings.district_font_size * settings.district_line_spacing;
  const schoolLineHeight = settings.header_font_size * settings.school_line_spacing;
  const textYStart = logoYPx + 20;

  // Calculate watermark position
  const watermarkSizePx = mmToPx(settings.watermark_size);
  let watermarkX = 0, watermarkY = 0;
  switch (settings.watermark_position) {
    case 'center':
      watermarkX = (pageWidthPx - watermarkSizePx) / 2;
      watermarkY = (300 - watermarkSizePx) / 2;
      break;
    case 'top-left':
      watermarkX = 75;
      watermarkY = 40;
      break;
    case 'top-right':
      watermarkX = pageWidthPx - watermarkSizePx - 75;
      watermarkY = 40;
      break;
    case 'bottom-left':
      watermarkX = 75;
      watermarkY = 300 - watermarkSizePx - 40;
      break;
    case 'bottom-right':
      watermarkX = pageWidthPx - watermarkSizePx - 75;
      watermarkY = 300 - watermarkSizePx - 40;
      break;
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Preview Kop Surat
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border-2 border-dashed rounded-lg p-4 bg-muted/30">
          <div 
            className="bg-white rounded shadow-sm mx-auto relative overflow-hidden"
            style={{ 
              width: `${pageWidthPx}px`,
              maxWidth: '100%',
              height: '300px',
              transform: 'scale(0.75)',
              transformOrigin: 'top center'
            }}
          >
            {/* Watermark (behind everything) */}
            {settings.watermark_enabled && watermarkSrc && (
              <img
                src={watermarkSrc}
                alt="Watermark"
                className="absolute object-contain pointer-events-none"
                style={{
                  width: `${watermarkSizePx}px`,
                  height: `${watermarkSizePx}px`,
                  left: `${watermarkX}px`,
                  top: `${watermarkY}px`,
                  opacity: settings.watermark_opacity / 100,
                  zIndex: 0,
                }}
              />
            )}

            {/* Left Logo */}
            {logoSrc && (
              <img
                src={logoSrc}
                alt="Logo Kiri"
                className="absolute object-contain"
                style={{
                  width: `${logoWidthPx}px`,
                  height: `${logoHeightPx}px`,
                  left: `${logoXPx}px`,
                  top: `${logoYPx}px`,
                  zIndex: 1,
                }}
              />
            )}
            
            {/* Right Logo */}
            {rightLogoSrc && (
              <img
                src={rightLogoSrc}
                alt="Logo Kanan"
                className="absolute object-contain"
                style={{
                  width: `${rightLogoWidthPx}px`,
                  height: `${rightLogoHeightPx}px`,
                  left: `${rightLogoXPx}px`,
                  top: `${rightLogoYPx}px`,
                  zIndex: 1,
                }}
              />
            )}
            
            {/* District Name */}
            {settings.district_name && (
              <div
                className="absolute text-center text-gray-600"
                style={{
                  width: '100%',
                  top: `${textYStart - 8}px`,
                  fontSize: `${settings.district_font_size}px`,
                  fontWeight: settings.district_font_style.includes('bold') ? 'bold' : 'normal',
                  fontStyle: settings.district_font_style.includes('italic') ? 'italic' : 'normal',
                  letterSpacing: '0.5px',
                  lineHeight: settings.district_line_spacing
                }}
              >
                {settings.district_name.toUpperCase()}
              </div>
            )}
            
            {/* School Name */}
            <div
              className="absolute text-center"
              style={{
                width: '100%',
                top: `${settings.district_name ? textYStart - 8 + districtLineHeight : textYStart}px`,
                fontSize: `${settings.header_font_size}px`,
                fontWeight: settings.header_font_style.includes('bold') ? 'bold' : 'normal',
                fontStyle: settings.header_font_style.includes('italic') ? 'italic' : 'normal',
                letterSpacing: '0.5px',
                lineHeight: settings.school_line_spacing
              }}
            >
              {settings.school_name || 'NAMA SEKOLAH'}
            </div>
            
            {/* School Address */}
            {settings.show_address && settings.school_address && (
              <div
                className="absolute text-center text-gray-700"
                style={{
                  width: '100%',
                  top: `${(settings.district_name ? textYStart - 8 + districtLineHeight : textYStart) + schoolLineHeight + 10}px`,
                  fontSize: `${settings.subheader_font_size}px`,
                  lineHeight: '1.4'
                }}
              >
                {settings.school_address}
              </div>
            )}
            
            {/* School Phone */}
            {settings.show_phone && settings.school_phone && (
              <div
                className="absolute text-center text-gray-600"
                style={{
                  width: '100%',
                  top: `${(settings.district_name ? textYStart - 8 + districtLineHeight : textYStart) + schoolLineHeight + (settings.show_address && settings.school_address ? 30 : 10)}px`,
                  fontSize: `${settings.subheader_font_size - 1}px`,
                }}
              >
                Telp: {settings.school_phone}
              </div>
            )}
            
            {/* Separator Lines */}
            <div
              className="absolute border-t-2 border-gray-700"
              style={{
                left: '53px',
                right: '53px',
                top: `${(settings.district_name ? textYStart - 8 + districtLineHeight : textYStart) + schoolLineHeight + (settings.show_address && settings.school_address ? 45 : 25) + (settings.show_phone && settings.school_phone ? 15 : 0)}px`,
              }}
            />
            <div
              className="absolute border-t border-gray-400"
              style={{
                left: '53px',
                right: '53px',
                top: `${(settings.district_name ? textYStart - 8 + districtLineHeight : textYStart) + schoolLineHeight + (settings.show_address && settings.school_address ? 49 : 29) + (settings.show_phone && settings.school_phone ? 15 : 0)}px`,
              }}
            />
            
            {/* Sample Content Area */}
            <div
              className="absolute text-center text-sm text-gray-400"
              style={{
                width: '100%',
                top: `${(settings.district_name ? textYStart - 8 + districtLineHeight : textYStart) + schoolLineHeight + (settings.show_address && settings.school_address ? 70 : 50) + (settings.show_phone && settings.school_phone ? 15 : 0)}px`,
              }}
            >
              [ Isi Laporan ]
            </div>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-4">
            Preview diperkecil 75% untuk tampilan. Ukuran sebenarnya akan terlihat pada PDF yang dicetak.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
