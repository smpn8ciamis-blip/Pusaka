import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaxTypeManager } from "@/components/tax/TaxTypeManager";
import { TaxRecordManager } from "@/components/tax/TaxRecordManager";
import { TaxStatistics } from "@/components/tax/TaxStatistics";
import { Receipt, Settings, BarChart3 } from "lucide-react";

export default function TaxManagement() {
  const [activeTab, setActiveTab] = useState("records");

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Manajemen Pajak</h1>
            <p className="text-muted-foreground">
              Kelola pemungutan dan penyetoran pajak
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
              <TabsTrigger value="records" className="flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                <span className="hidden sm:inline">Catatan Pajak</span>
                <span className="sm:hidden">Catatan</span>
              </TabsTrigger>
              <TabsTrigger value="statistics" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Statistik</span>
                <span className="sm:hidden">Statistik</span>
              </TabsTrigger>
              <TabsTrigger value="types" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Jenis Pajak</span>
                <span className="sm:hidden">Jenis</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="records">
              <TaxRecordManager />
            </TabsContent>

            <TabsContent value="statistics">
              <TaxStatistics />
            </TabsContent>

            <TabsContent value="types">
              <TaxTypeManager />
            </TabsContent>
          </Tabs>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
