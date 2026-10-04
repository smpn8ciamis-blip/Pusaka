import { useState, useCallback, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, RotateCcw, Settings2, FileText, Map, ClipboardList, Save, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// SPD Page Settings (Halaman 1)
export interface SPDPageSettings {
  // Margins
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  
  // Font sizes
  headerFontSize: number;
  titleFontSize: number;
  bodyFontSize: number;
  tableFontSize: number;
  
  // Spacing
  lineSpacing: number;
  paragraphSpacing: number;
  
  // Table
  tableCellPadding: number;
  tableLineWidth: number;
  
  // Signature
  signatureSpacing: number;
  signatureLineWidth: number;
  
  // Show/hide
  showWatermark: boolean;
  showLetterhead: boolean;
}

// Log Perjalanan Settings (Halaman 2)
export interface LogPerjalananSettings {
  // Margins
  marginTop: number;
  marginLeft: number;
  marginRight: number;
  
  // Font sizes
  sectionFontSize: number;
  labelFontSize: number;
  valueFontSize: number;
  
  // Spacing
  sectionSpacing: number;
  rowHeight: number;
  
  // Table
  tableLineWidth: number;
  boxPadding: number;
  
  // Signature
  signatureSpacing: number;
  signatureFontSize: number;
}

// LPT Settings (Laporan Pelaksanaan Tugas)
export interface LPTSettings {
  // Margins
  marginTop: number;
  marginLeft: number;
  marginRight: number;
  
  // Font sizes
  titleFontSize: number;
  bodyFontSize: number;
  labelFontSize: number;
  
  // Spacing
  lineSpacing: number;
  sectionSpacing: number;
  
  // Layout
  labelColumnWidth: number;
  dottedLineLength: number;
  dottedLineRows: number;
  
  // Signature
  signatureSpacing: number;
  signatureWidth: number;
}

// Combined settings type
export interface SPDPdfSettingsType {
  spd: SPDPageSettings;
  logPerjalanan: LogPerjalananSettings;
  lpt: LPTSettings;
}

export const DEFAULT_SPD_PAGE_SETTINGS: SPDPageSettings = {
  marginTop: 15,
  marginBottom: 14,
  marginLeft: 14,
  marginRight: 14,
  
  headerFontSize: 9,
  titleFontSize: 12,
  bodyFontSize: 10,
  tableFontSize: 9,
  
  lineSpacing: 5,
  paragraphSpacing: 8,
  
  tableCellPadding: 3,
  tableLineWidth: 0.2,
  
  signatureSpacing: 20,
  signatureLineWidth: 50,
  
  showWatermark: true,
  showLetterhead: true,
};

export const DEFAULT_LOG_PERJALANAN_SETTINGS: LogPerjalananSettings = {
  marginTop: 15,
  marginLeft: 14,
  marginRight: 14,
  
  sectionFontSize: 9,
  labelFontSize: 8,
  valueFontSize: 8,
  
  sectionSpacing: 0,
  rowHeight: 42,
  
  tableLineWidth: 0.2,
  boxPadding: 3,
  
  signatureSpacing: 15,
  signatureFontSize: 10,
};

export const DEFAULT_LPT_SETTINGS: LPTSettings = {
  marginTop: 30,
  marginLeft: 14,
  marginRight: 14,
  
  titleFontSize: 14,
  bodyFontSize: 10,
  labelFontSize: 10,
  
  lineSpacing: 8,
  sectionSpacing: 22,
  
  labelColumnWidth: 60,
  dottedLineLength: 90,
  dottedLineRows: 6,
  
  signatureSpacing: 25,
  signatureWidth: 60,
};

export const DEFAULT_SPD_SETTINGS: SPDPdfSettingsType = {
  spd: DEFAULT_SPD_PAGE_SETTINGS,
  logPerjalanan: DEFAULT_LOG_PERJALANAN_SETTINGS,
  lpt: DEFAULT_LPT_SETTINGS,
};

interface SPDPdfSettingsPanelProps {
  settings: SPDPdfSettingsType;
  onChange: (settings: SPDPdfSettingsType) => void;
  onReset: () => void;
  onSave?: () => void;
  isSaving?: boolean;
}

// Hook to fetch and save SPD PDF settings from/to database
export function useSPDPdfSettings() {
  const queryClient = useQueryClient();

  const { data: dbSettings, isLoading } = useQuery({
    queryKey: ['spd-pdf-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('spd_pdf_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching SPD PDF settings:', error);
        return null;
      }
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (settings: SPDPdfSettingsType) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Check if settings exist
      const { data: existing } = await supabase
        .from('spd_pdf_settings')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('spd_pdf_settings')
          .update({
            settings: JSON.parse(JSON.stringify(settings)),
            updated_by: user.id,
          })
          .eq('id', existing.id);
        
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('spd_pdf_settings')
          .insert([{
            settings: JSON.parse(JSON.stringify(settings)),
            updated_by: user.id,
          }]);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spd-pdf-settings'] });
      toast.success('Pengaturan PDF berhasil disimpan');
    },
    onError: (error) => {
      console.error('Error saving SPD PDF settings:', error);
      toast.error('Gagal menyimpan pengaturan PDF');
    },
  });

  const getSettings = (): SPDPdfSettingsType => {
    if (dbSettings?.settings) {
      // Merge with defaults to ensure all fields exist
      const saved = dbSettings.settings as unknown as SPDPdfSettingsType;
      return {
        spd: { ...DEFAULT_SPD_PAGE_SETTINGS, ...saved.spd },
        logPerjalanan: { ...DEFAULT_LOG_PERJALANAN_SETTINGS, ...saved.logPerjalanan },
        lpt: { ...DEFAULT_LPT_SETTINGS, ...saved.lpt },
      };
    }
    return DEFAULT_SPD_SETTINGS;
  };

  return {
    settings: getSettings(),
    isLoading,
    saveSettings: saveMutation.mutate,
    isSaving: saveMutation.isPending,
  };
}

interface SettingGroupProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function SettingGroup({ title, children, defaultOpen = false }: SettingGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-3 hover:bg-muted/50 rounded-md transition-colors">
        <span className="text-sm font-medium">{title}</span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 space-y-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface SliderSettingProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

function SliderSetting({ label, value, min, max, step = 1, unit = "mm", onChange }: SliderSettingProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            className="w-16 h-7 text-xs text-right"
            min={min}
            max={max}
            step={step}
          />
          <span className="text-xs text-muted-foreground w-6">{unit}</span>
        </div>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
    </div>
  );
}

// SPD Page Settings Panel
function SPDPageSettingsPanel({ 
  settings, 
  onChange 
}: { 
  settings: SPDPageSettings; 
  onChange: (settings: SPDPageSettings) => void;
}) {
  const updateSetting = useCallback(<K extends keyof SPDPageSettings>(
    key: K,
    value: SPDPageSettings[K]
  ) => {
    onChange({ ...settings, [key]: value });
  }, [settings, onChange]);

  return (
    <div className="space-y-1">
      <SettingGroup title="Margin Halaman SPD" defaultOpen>
        <SliderSetting label="Margin Atas" value={settings.marginTop} min={5} max={40} onChange={(v) => updateSetting("marginTop", v)} />
        <SliderSetting label="Margin Bawah" value={settings.marginBottom} min={5} max={40} onChange={(v) => updateSetting("marginBottom", v)} />
        <SliderSetting label="Margin Kiri" value={settings.marginLeft} min={5} max={40} onChange={(v) => updateSetting("marginLeft", v)} />
        <SliderSetting label="Margin Kanan" value={settings.marginRight} min={5} max={40} onChange={(v) => updateSetting("marginRight", v)} />
      </SettingGroup>

      <Separator className="my-2" />

      <SettingGroup title="Ukuran Font SPD">
        <SliderSetting label="Header Info" value={settings.headerFontSize} min={6} max={14} step={0.5} unit="pt" onChange={(v) => updateSetting("headerFontSize", v)} />
        <SliderSetting label="Judul" value={settings.titleFontSize} min={8} max={18} step={0.5} unit="pt" onChange={(v) => updateSetting("titleFontSize", v)} />
        <SliderSetting label="Body Text" value={settings.bodyFontSize} min={7} max={14} step={0.5} unit="pt" onChange={(v) => updateSetting("bodyFontSize", v)} />
        <SliderSetting label="Tabel" value={settings.tableFontSize} min={6} max={12} step={0.5} unit="pt" onChange={(v) => updateSetting("tableFontSize", v)} />
      </SettingGroup>

      <Separator className="my-2" />

      <SettingGroup title="Jarak & Spasi SPD">
        <SliderSetting label="Spasi Baris" value={settings.lineSpacing} min={3} max={12} step={0.5} onChange={(v) => updateSetting("lineSpacing", v)} />
        <SliderSetting label="Spasi Paragraf" value={settings.paragraphSpacing} min={4} max={20} onChange={(v) => updateSetting("paragraphSpacing", v)} />
      </SettingGroup>

      <Separator className="my-2" />

      <SettingGroup title="Tabel SPD">
        <SliderSetting label="Padding Sel" value={settings.tableCellPadding} min={1} max={8} step={0.5} onChange={(v) => updateSetting("tableCellPadding", v)} />
        <SliderSetting label="Ketebalan Garis" value={settings.tableLineWidth} min={0.1} max={1} step={0.1} onChange={(v) => updateSetting("tableLineWidth", v)} />
      </SettingGroup>

      <Separator className="my-2" />

      <SettingGroup title="Tanda Tangan SPD">
        <SliderSetting label="Jarak TTD" value={settings.signatureSpacing} min={10} max={40} onChange={(v) => updateSetting("signatureSpacing", v)} />
        <SliderSetting label="Lebar Garis TTD" value={settings.signatureLineWidth} min={30} max={80} onChange={(v) => updateSetting("signatureLineWidth", v)} />
      </SettingGroup>

      <Separator className="my-2" />

      <SettingGroup title="Tampilkan/Sembunyikan">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Watermark</Label>
          <Switch checked={settings.showWatermark} onCheckedChange={(v) => updateSetting("showWatermark", v)} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Kop Surat</Label>
          <Switch checked={settings.showLetterhead} onCheckedChange={(v) => updateSetting("showLetterhead", v)} />
        </div>
      </SettingGroup>
    </div>
  );
}

// Log Perjalanan Settings Panel
function LogPerjalananSettingsPanel({ 
  settings, 
  onChange 
}: { 
  settings: LogPerjalananSettings; 
  onChange: (settings: LogPerjalananSettings) => void;
}) {
  const updateSetting = useCallback(<K extends keyof LogPerjalananSettings>(
    key: K,
    value: LogPerjalananSettings[K]
  ) => {
    onChange({ ...settings, [key]: value });
  }, [settings, onChange]);

  return (
    <div className="space-y-1">
      <SettingGroup title="Margin Log Perjalanan" defaultOpen>
        <SliderSetting label="Margin Atas" value={settings.marginTop} min={5} max={40} onChange={(v) => updateSetting("marginTop", v)} />
        <SliderSetting label="Margin Kiri" value={settings.marginLeft} min={5} max={40} onChange={(v) => updateSetting("marginLeft", v)} />
        <SliderSetting label="Margin Kanan" value={settings.marginRight} min={5} max={40} onChange={(v) => updateSetting("marginRight", v)} />
      </SettingGroup>

      <Separator className="my-2" />

      <SettingGroup title="Ukuran Font Log">
        <SliderSetting label="Font Seksi" value={settings.sectionFontSize} min={6} max={14} step={0.5} unit="pt" onChange={(v) => updateSetting("sectionFontSize", v)} />
        <SliderSetting label="Font Label" value={settings.labelFontSize} min={5} max={12} step={0.5} unit="pt" onChange={(v) => updateSetting("labelFontSize", v)} />
        <SliderSetting label="Font Nilai" value={settings.valueFontSize} min={5} max={12} step={0.5} unit="pt" onChange={(v) => updateSetting("valueFontSize", v)} />
      </SettingGroup>

      <Separator className="my-2" />

      <SettingGroup title="Layout Log">
        <SliderSetting label="Jarak Seksi" value={settings.sectionSpacing} min={0} max={20} onChange={(v) => updateSetting("sectionSpacing", v)} />
        <SliderSetting label="Tinggi Baris" value={settings.rowHeight} min={30} max={60} onChange={(v) => updateSetting("rowHeight", v)} />
        <SliderSetting label="Padding Box" value={settings.boxPadding} min={1} max={10} step={0.5} onChange={(v) => updateSetting("boxPadding", v)} />
      </SettingGroup>

      <Separator className="my-2" />

      <SettingGroup title="Garis Tabel Log">
        <SliderSetting label="Ketebalan Garis" value={settings.tableLineWidth} min={0.1} max={1} step={0.1} onChange={(v) => updateSetting("tableLineWidth", v)} />
      </SettingGroup>

      <Separator className="my-2" />

      <SettingGroup title="Tanda Tangan Log">
        <SliderSetting label="Jarak TTD" value={settings.signatureSpacing} min={10} max={40} onChange={(v) => updateSetting("signatureSpacing", v)} />
        <SliderSetting label="Font TTD" value={settings.signatureFontSize} min={7} max={14} step={0.5} unit="pt" onChange={(v) => updateSetting("signatureFontSize", v)} />
      </SettingGroup>
    </div>
  );
}

// LPT Settings Panel
function LPTSettingsPanel({ 
  settings, 
  onChange 
}: { 
  settings: LPTSettings; 
  onChange: (settings: LPTSettings) => void;
}) {
  const updateSetting = useCallback(<K extends keyof LPTSettings>(
    key: K,
    value: LPTSettings[K]
  ) => {
    onChange({ ...settings, [key]: value });
  }, [settings, onChange]);

  return (
    <div className="space-y-1">
      <SettingGroup title="Margin LPT" defaultOpen>
        <SliderSetting label="Margin Atas" value={settings.marginTop} min={10} max={50} onChange={(v) => updateSetting("marginTop", v)} />
        <SliderSetting label="Margin Kiri" value={settings.marginLeft} min={5} max={40} onChange={(v) => updateSetting("marginLeft", v)} />
        <SliderSetting label="Margin Kanan" value={settings.marginRight} min={5} max={40} onChange={(v) => updateSetting("marginRight", v)} />
      </SettingGroup>

      <Separator className="my-2" />

      <SettingGroup title="Ukuran Font LPT">
        <SliderSetting label="Font Judul" value={settings.titleFontSize} min={10} max={20} step={0.5} unit="pt" onChange={(v) => updateSetting("titleFontSize", v)} />
        <SliderSetting label="Font Body" value={settings.bodyFontSize} min={7} max={14} step={0.5} unit="pt" onChange={(v) => updateSetting("bodyFontSize", v)} />
        <SliderSetting label="Font Label" value={settings.labelFontSize} min={7} max={14} step={0.5} unit="pt" onChange={(v) => updateSetting("labelFontSize", v)} />
      </SettingGroup>

      <Separator className="my-2" />

      <SettingGroup title="Jarak & Spasi LPT">
        <SliderSetting label="Spasi Baris" value={settings.lineSpacing} min={5} max={15} onChange={(v) => updateSetting("lineSpacing", v)} />
        <SliderSetting label="Spasi Seksi" value={settings.sectionSpacing} min={10} max={40} onChange={(v) => updateSetting("sectionSpacing", v)} />
      </SettingGroup>

      <Separator className="my-2" />

      <SettingGroup title="Layout LPT">
        <SliderSetting label="Lebar Kolom Label" value={settings.labelColumnWidth} min={40} max={80} onChange={(v) => updateSetting("labelColumnWidth", v)} />
        <SliderSetting label="Panjang Titik-titik" value={settings.dottedLineLength} min={50} max={120} onChange={(v) => updateSetting("dottedLineLength", v)} />
        <SliderSetting label="Jumlah Baris Titik" value={settings.dottedLineRows} min={3} max={10} onChange={(v) => updateSetting("dottedLineRows", v)} />
      </SettingGroup>

      <Separator className="my-2" />

      <SettingGroup title="Tanda Tangan LPT">
        <SliderSetting label="Jarak TTD" value={settings.signatureSpacing} min={15} max={50} onChange={(v) => updateSetting("signatureSpacing", v)} />
        <SliderSetting label="Lebar Area TTD" value={settings.signatureWidth} min={40} max={100} onChange={(v) => updateSetting("signatureWidth", v)} />
      </SettingGroup>
    </div>
  );
}

export function SPDPdfSettingsPanel({ settings, onChange, onReset, onSave, isSaving }: SPDPdfSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState("spd");

  const updateSPDSettings = useCallback((spdSettings: SPDPageSettings) => {
    onChange({ ...settings, spd: spdSettings });
  }, [settings, onChange]);

  const updateLogSettings = useCallback((logSettings: LogPerjalananSettings) => {
    onChange({ ...settings, logPerjalanan: logSettings });
  }, [settings, onChange]);

  const updateLPTSettings = useCallback((lptSettings: LPTSettings) => {
    onChange({ ...settings, lpt: lptSettings });
  }, [settings, onChange]);

  return (
    <div className="h-full flex flex-col bg-card border-l">
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Pengaturan PDF</h3>
        </div>
        <div className="flex items-center gap-1">
          {onSave && (
            <Button
              variant="default"
              size="sm"
              onClick={onSave}
              disabled={isSaving}
              className="h-7 px-2 text-xs"
            >
              {isSaving ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Save className="h-3 w-3 mr-1" />
              )}
              Simpan
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-7 px-2 text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full grid grid-cols-3 px-2 pt-2 bg-transparent">
          <TabsTrigger value="spd" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FileText className="h-3 w-3 mr-1" />
            SPD
          </TabsTrigger>
          <TabsTrigger value="log" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Map className="h-3 w-3 mr-1" />
            Log
          </TabsTrigger>
          <TabsTrigger value="lpt" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <ClipboardList className="h-3 w-3 mr-1" />
            LPT
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="spd" className="mt-0 p-2">
            <SPDPageSettingsPanel settings={settings.spd} onChange={updateSPDSettings} />
          </TabsContent>

          <TabsContent value="log" className="mt-0 p-2">
            <LogPerjalananSettingsPanel settings={settings.logPerjalanan} onChange={updateLogSettings} />
          </TabsContent>

          <TabsContent value="lpt" className="mt-0 p-2">
            <LPTSettingsPanel settings={settings.lpt} onChange={updateLPTSettings} />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
