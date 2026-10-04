import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Check, Package } from 'lucide-react';
import { useSubscriptionPlans, type SubscriptionPlan } from '@/hooks/useSubscriptionPlans';
import { FEATURE_LABELS, formatRupiah, type FeatureKey } from '@/config/subscriptionPlans';

const ALL_FEATURES = Object.entries(FEATURE_LABELS) as [FeatureKey, string][];

const emptyForm = {
  plan_key: '',
  label: '',
  description: '',
  max_students: 100,
  max_teachers: 20,
  duration_months: 1,
  monthly_price: 0,
  features: [] as FeatureKey[],
  is_active: true,
  sort_order: 0,
};

export default function PlanManagementTab() {
  const { plans, isLoading, upsertPlan, deletePlan } = useSubscriptionPlans();
  const [isOpen, setIsOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openCreate = () => {
    setEditingPlan(null);
    setForm({ ...emptyForm, sort_order: plans.length + 1 });
    setIsOpen(true);
  };

  const openEdit = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setForm({
      plan_key: plan.plan_key,
      label: plan.label,
      description: plan.description,
      max_students: plan.max_students,
      max_teachers: plan.max_teachers,
      duration_months: plan.duration_months,
      monthly_price: plan.monthly_price,
      features: plan.features,
      is_active: plan.is_active,
      sort_order: plan.sort_order,
    });
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!form.plan_key || !form.label) {
      toast.error('Kunci dan nama paket wajib diisi');
      return;
    }
    try {
      await upsertPlan.mutateAsync(form);
      toast.success('Paket berhasil disimpan!');
      setIsOpen(false);
    } catch (e: any) {
      toast.error('Gagal menyimpan: ' + e.message);
    }
  };

  const handleDelete = async (plan: SubscriptionPlan) => {
    if (!confirm(`Hapus paket "${plan.label}"?`)) return;
    try {
      await deletePlan.mutateAsync(plan.id);
      toast.success('Paket dihapus');
    } catch (e: any) {
      toast.error('Gagal menghapus: ' + e.message);
    }
  };

  const toggleFeature = (feature: FeatureKey) => {
    setForm(f => ({
      ...f,
      features: f.features.includes(feature)
        ? f.features.filter(ff => ff !== feature)
        : [...f.features, feature],
    }));
  };

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Memuat...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Kelola Paket Langganan</h3>
          <p className="text-sm text-muted-foreground">Atur harga, kuota, dan fitur setiap paket</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />Tambah Paket</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {plans.map(plan => (
          <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    {plan.label}
                    {!plan.is_active && <Badge variant="outline">Nonaktif</Badge>}
                  </CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </div>
                <div className="text-right">
                  <div className="font-bold text-primary">{formatRupiah(plan.monthly_price)}</div>
                  <div className="text-xs text-muted-foreground">/bulan</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-4 text-sm">
                <span>Maks Siswa: <strong>{plan.max_students}</strong></span>
                <span>Maks Guru: <strong>{plan.max_teachers}</strong></span>
              </div>
              <div className="flex flex-wrap gap-1">
                {plan.features.slice(0, 6).map(f => (
                  <Badge key={f} variant="secondary" className="text-xs">{FEATURE_LABELS[f] || f}</Badge>
                ))}
                {plan.features.length > 6 && (
                  <Badge variant="outline" className="text-xs">+{plan.features.length - 6} lainnya</Badge>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => openEdit(plan)}>
                  <Edit2 className="h-3.5 w-3.5" />Edit
                </Button>
                <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={() => handleDelete(plan)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Edit Paket' : 'Tambah Paket Baru'}</DialogTitle>
            <DialogDescription>Atur detail paket langganan</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kunci Paket *</Label>
                <Input value={form.plan_key} onChange={e => setForm(f => ({ ...f, plan_key: e.target.value }))} placeholder="starter" disabled={!!editingPlan} />
              </div>
              <div>
                <Label>Nama Tampilan *</Label>
                <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Starter" />
              </div>
            </div>
            <div>
              <Label>Deskripsi</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Fitur dasar..." />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Harga/bulan (Rp)</Label>
                <Input type="number" value={form.monthly_price} onChange={e => setForm(f => ({ ...f, monthly_price: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>Maks Siswa</Label>
                <Input type="number" value={form.max_students} onChange={e => setForm(f => ({ ...f, max_students: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>Maks Guru</Label>
                <Input type="number" value={form.max_teachers} onChange={e => setForm(f => ({ ...f, max_teachers: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Urutan</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
                <Label>Aktif</Label>
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Fitur yang Termasuk</Label>
              <div className="grid grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                {ALL_FEATURES.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={form.features.includes(key)}
                      onCheckedChange={() => toggleFeature(key)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <Button onClick={handleSave} disabled={upsertPlan.isPending} className="w-full">
              {upsertPlan.isPending ? 'Menyimpan...' : 'Simpan Paket'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
