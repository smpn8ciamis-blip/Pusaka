import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, RotateCcw, Receipt } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export interface ReceiptPdfSettings {
  // Margins
  marginTop: number;
  marginLeft: number;
  marginRight: number;
  
  // Font sizes
  titleFontSize: number;
  headerFontSize: number;
  tableFontSize: number;
  terbilangFontSize: number;
  signatureFontSize: number;
  
  // Spacing
  headerSpacing: number;
  tableRowHeight: number;
  terbilangToTaxSpacing: number;
  taxToSignatureSpacing: number;
  signatureSpacing: number;
  signatureNameSpacing: number;
  
  // Table
  tableLineWidth: number;
  
  // Signature
  signatureColumnWidth: number;
  
  // Show/hide
  showLetterhead: boolean;
  showTax: boolean;
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptPdfSettings = {
  marginTop: 15,
  marginLeft: 15,
  marginRight: 15,
  
  titleFontSize: 14,
  headerFontSize: 10,
  tableFontSize: 7,
  terbilangFontSize: 9,
  signatureFontSize: 9,
  
  headerSpacing: 7,
  tableRowHeight: 7,
  terbilangToTaxSpacing: 5,
  taxToSignatureSpacing: 15,
  signatureSpacing: 20,
  signatureNameSpacing: 4,
  
  tableLineWidth: 0.3,
  
  signatureColumnWidth: 35,
  
  showLetterhead: true,
  showTax: true,
};

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
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

function SliderSetting({ label, value, onChange, min, max, step = 1, unit = "mm" }: SliderSettingProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-16 h-6 text-xs text-right"
            min={min}
            max={max}
            step={step}
          />
          <span className="text-xs text-muted-foreground">{unit}</span>
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

interface ReceiptPdfSettingsPanelProps {
  settings: ReceiptPdfSettings;
  onChange: (settings: ReceiptPdfSettings) => void;
  onReset: () => void;
}

export function ReceiptPdfSettingsPanel({ settings, onChange, onReset }: ReceiptPdfSettingsPanelProps) {
  const updateSetting = <K extends keyof ReceiptPdfSettings>(
    key: K,
    value: ReceiptPdfSettings[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Pengaturan Kwitansi</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onReset} className="h-7 px-2">
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* Margin Settings */}
          <SettingGroup title="Margin" defaultOpen>
            <SliderSetting
              label="Margin Atas"
              value={settings.marginTop}
              onChange={(v) => updateSetting("marginTop", v)}
              min={5}
              max={40}
            />
            <SliderSetting
              label="Margin Kiri"
              value={settings.marginLeft}
              onChange={(v) => updateSetting("marginLeft", v)}
              min={5}
              max={40}
            />
            <SliderSetting
              label="Margin Kanan"
              value={settings.marginRight}
              onChange={(v) => updateSetting("marginRight", v)}
              min={5}
              max={40}
            />
          </SettingGroup>

          <Separator />

          {/* Font Size Settings */}
          <SettingGroup title="Ukuran Font">
            <SliderSetting
              label="Judul"
              value={settings.titleFontSize}
              onChange={(v) => updateSetting("titleFontSize", v)}
              min={10}
              max={20}
              unit="pt"
            />
            <SliderSetting
              label="Header"
              value={settings.headerFontSize}
              onChange={(v) => updateSetting("headerFontSize", v)}
              min={8}
              max={14}
              unit="pt"
            />
            <SliderSetting
              label="Tabel"
              value={settings.tableFontSize}
              onChange={(v) => updateSetting("tableFontSize", v)}
              min={6}
              max={10}
              unit="pt"
            />
            <SliderSetting
              label="Terbilang"
              value={settings.terbilangFontSize}
              onChange={(v) => updateSetting("terbilangFontSize", v)}
              min={7}
              max={12}
              unit="pt"
            />
            <SliderSetting
              label="Tanda Tangan"
              value={settings.signatureFontSize}
              onChange={(v) => updateSetting("signatureFontSize", v)}
              min={7}
              max={12}
              unit="pt"
            />
          </SettingGroup>

          <Separator />

          {/* Spacing Settings */}
          <SettingGroup title="Jarak">
            <SliderSetting
              label="Jarak Header"
              value={settings.headerSpacing}
              onChange={(v) => updateSetting("headerSpacing", v)}
              min={3}
              max={15}
            />
            <SliderSetting
              label="Tinggi Baris Tabel"
              value={settings.tableRowHeight}
              onChange={(v) => updateSetting("tableRowHeight", v)}
              min={5}
              max={12}
            />
            <SliderSetting
              label="Terbilang ke Pajak"
              value={settings.terbilangToTaxSpacing}
              onChange={(v) => updateSetting("terbilangToTaxSpacing", v)}
              min={0}
              max={15}
            />
            <SliderSetting
              label="Pajak ke Tanda Tangan"
              value={settings.taxToSignatureSpacing}
              onChange={(v) => updateSetting("taxToSignatureSpacing", v)}
              min={5}
              max={30}
            />
            <SliderSetting
              label="Jarak Tanda Tangan"
              value={settings.signatureSpacing}
              onChange={(v) => updateSetting("signatureSpacing", v)}
              min={10}
              max={40}
            />
            <SliderSetting
              label="Jarak Nama TTD"
              value={settings.signatureNameSpacing}
              onChange={(v) => updateSetting("signatureNameSpacing", v)}
              min={2}
              max={10}
            />
          </SettingGroup>

          <Separator />

          {/* Table Settings */}
          <SettingGroup title="Tabel">
            <SliderSetting
              label="Ketebalan Garis"
              value={settings.tableLineWidth}
              onChange={(v) => updateSetting("tableLineWidth", v)}
              min={0.1}
              max={1}
              step={0.1}
            />
          </SettingGroup>

          <Separator />

          {/* Signature Settings */}
          <SettingGroup title="Tanda Tangan">
            <SliderSetting
              label="Lebar Kolom TTD"
              value={settings.signatureColumnWidth}
              onChange={(v) => updateSetting("signatureColumnWidth", v)}
              min={20}
              max={60}
            />
          </SettingGroup>

          <Separator />

          {/* Toggle Settings */}
          <SettingGroup title="Tampilkan/Sembunyikan">
            <div className="flex items-center justify-between py-1">
              <Label className="text-xs">Kop Surat</Label>
              <Switch
                checked={settings.showLetterhead}
                onCheckedChange={(v) => updateSetting("showLetterhead", v)}
              />
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="text-xs">Info Pajak</Label>
              <Switch
                checked={settings.showTax}
                onCheckedChange={(v) => updateSetting("showTax", v)}
              />
            </div>
          </SettingGroup>
        </div>
      </ScrollArea>
    </div>
  );
}
