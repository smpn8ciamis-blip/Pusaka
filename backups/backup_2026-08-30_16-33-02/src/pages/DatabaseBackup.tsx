import { DatabaseBackup as DatabaseBackupComponent } from "@/components/DatabaseBackup";
import { DashboardLayout } from "@/components/DashboardLayout";

const DatabaseBackup = () => {
  return (
    <DashboardLayout>
      <div className="container mx-auto py-6">
        <DatabaseBackupComponent />
      </div>
    </DashboardLayout>
  );
};

export default DatabaseBackup;
