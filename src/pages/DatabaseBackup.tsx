import { DatabaseBackup as DatabaseBackupComponent } from "@/components/DatabaseBackup";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AutoBackupSettings } from "@/components/AutoBackupSettings";

const DatabaseBackup = () => {
  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 space-y-6">
        <AutoBackupSettings />
        <DatabaseBackupComponent />
      </div>
    </DashboardLayout>
  );
};

export default DatabaseBackup;
