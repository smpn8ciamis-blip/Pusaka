import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Lock, Settings } from 'lucide-react';
import { NotificationManager } from '@/components/billing/NotificationManager';
import { AccountLockManager } from '@/components/billing/AccountLockManager';

export default function BillingDashboard() {
  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Billing</h1>
          <p className="text-muted-foreground">
            Kelola notifikasi popup dan penguncian akun sistem
          </p>
        </div>

        <Tabs defaultValue="notifications" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifikasi Popup
            </TabsTrigger>
            <TabsTrigger value="lock" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Kunci Akun
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notifications">
            <NotificationManager />
          </TabsContent>

          <TabsContent value="lock">
            <AccountLockManager />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
