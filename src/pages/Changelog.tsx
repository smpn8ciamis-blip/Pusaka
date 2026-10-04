import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useChangelog } from '@/hooks/useChangelog';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Sparkles, 
  Bug, 
  Wrench, 
  AlertCircle, 
  ArrowLeft,
  Calendar,
  Code,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  History,
  Tag,
  Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const getChangeIcon = (type: string) => {
  switch (type) {
    case 'feature':
      return <Sparkles className="h-4 w-4 text-green-500" />;
    case 'fix':
      return <Bug className="h-4 w-4 text-red-500" />;
    case 'improvement':
      return <Wrench className="h-4 w-4 text-blue-500" />;
    case 'breaking':
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    default:
      return <Code className="h-4 w-4 text-muted-foreground" />;
  }
};

const getChangeBadge = (type: string) => {
  switch (type) {
    case 'feature':
      return <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">Fitur Baru</Badge>;
    case 'fix':
      return <Badge variant="default" className="bg-red-500/10 text-red-600 border-red-500/20">Perbaikan</Badge>;
    case 'improvement':
      return <Badge variant="default" className="bg-blue-500/10 text-blue-600 border-blue-500/20">Peningkatan</Badge>;
    case 'breaking':
      return <Badge variant="default" className="bg-orange-500/10 text-orange-600 border-orange-500/20">Breaking</Badge>;
    default:
      return <Badge variant="outline">Lainnya</Badge>;
  }
};

const Changelog = () => {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const isAdmin = userRole === 'admin';
  
  const {
    groupedChangelog,
    currentVersion,
    versions,
    isLoading,
    addEntry,
    deleteEntry,
    createVersion,
    updateRevision,
    generateRevision,
    isAdding,
    isDeleting,
  } = useChangelog();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showVersionDialog, setShowVersionDialog] = useState(false);
  const [newEntry, setNewEntry] = useState({
    version: '',
    change_type: 'feature' as const,
    description: '',
  });
  const [newVersion, setNewVersion] = useState('');

  const handleAddEntry = () => {
    if (!newEntry.version || !newEntry.description) return;
    addEntry(newEntry);
    setNewEntry({ version: '', change_type: 'feature', description: '' });
    setShowAddDialog(false);
  };

  const handleCreateVersion = () => {
    if (!newVersion) return;
    createVersion({ version: newVersion, revision: generateRevision() });
    setNewVersion('');
    setShowVersionDialog(false);
  };

  const handleUpdateRevision = () => {
    if (!currentVersion) return;
    updateRevision({ id: currentVersion.id, revision: generateRevision() });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Changelog</h1>
              <p className="text-muted-foreground">
                Riwayat perubahan dan pembaruan aplikasi
              </p>
            </div>
          </div>

          {isAdmin && (
            <div className="flex gap-2">
              <Dialog open={showVersionDialog} onOpenChange={setShowVersionDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Versi Baru
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Buat Versi Baru</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Nomor Versi</label>
                      <Input
                        placeholder="contoh: 1.1"
                        value={newVersion}
                        onChange={(e) => setNewVersion(e.target.value)}
                      />
                    </div>
                    <Button onClick={handleCreateVersion} className="w-full">
                      Buat Versi
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah Changelog
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Tambah Changelog</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Versi</label>
                      <Select
                        value={newEntry.version}
                        onValueChange={(v) => setNewEntry({ ...newEntry, version: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih versi" />
                        </SelectTrigger>
                        <SelectContent>
                          {versions.map((v) => (
                            <SelectItem key={v.id} value={v.version}>
                              v{v.version}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Tipe</label>
                      <Select
                        value={newEntry.change_type}
                        onValueChange={(v) => setNewEntry({ ...newEntry, change_type: v as any })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="feature">Fitur Baru</SelectItem>
                          <SelectItem value="fix">Perbaikan</SelectItem>
                          <SelectItem value="improvement">Peningkatan</SelectItem>
                          <SelectItem value="breaking">Breaking Change</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Deskripsi</label>
                      <Textarea
                        placeholder="Deskripsi perubahan..."
                        value={newEntry.description}
                        onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                      />
                    </div>
                    <Button onClick={handleAddEntry} disabled={isAdding} className="w-full">
                      {isAdding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Tambah
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Versi Saat Ini</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-base">
                  v{currentVersion?.version || '1.0'}
                </Badge>
                <Badge variant="outline" className="font-mono text-xs">
                  Rev. {currentVersion?.revision || '-'}
                </Badge>
                {isAdmin && (
                  <Button variant="ghost" size="icon" onClick={handleUpdateRevision} title="Update Revisi">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
        </Card>

        <Tabs defaultValue="changelog" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="changelog" className="gap-2">
              <Code className="h-4 w-4" />
              Changelog
            </TabsTrigger>
            <TabsTrigger value="versions" className="gap-2">
              <History className="h-4 w-4" />
              Riwayat Versi
            </TabsTrigger>
          </TabsList>

          <TabsContent value="changelog">
            <ScrollArea className="h-[calc(100vh-400px)]">
              <div className="space-y-6 pr-4">
                {groupedChangelog.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      Belum ada changelog. {isAdmin && 'Klik "Tambah Changelog" untuk menambahkan.'}
                    </CardContent>
                  </Card>
                ) : (
                  groupedChangelog.map((entry, index) => (
                    <Card key={entry.version}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge 
                              variant={index === 0 ? "default" : "outline"} 
                              className="text-base px-3 py-1"
                            >
                              v{entry.version}
                            </Badge>
                            {index === 0 && (
                              <Badge variant="secondary" className="bg-primary/10 text-primary">
                                Terbaru
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            {new Date(entry.date).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-3">
                          {entry.changes.map((change) => (
                            <li key={change.id} className="flex items-start gap-3 group">
                              <div className="mt-0.5">
                                {getChangeIcon(change.type)}
                              </div>
                              <div className="flex-1 flex items-start gap-2 flex-wrap">
                                {getChangeBadge(change.type)}
                                <span className="text-sm">{change.description}</span>
                              </div>
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                                  onClick={() => deleteEntry(change.id)}
                                  disabled={isDeleting}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                      {index < groupedChangelog.length - 1 && <Separator className="mt-2" />}
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="versions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Riwayat Semua Versi
                </CardTitle>
              </CardHeader>
              <CardContent>
                {versions.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    Belum ada riwayat versi.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>Versi</TableHead>
                        <TableHead>Revisi</TableHead>
                        <TableHead>Tanggal Rilis</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Jumlah Perubahan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {versions.map((version, index) => {
                        const changeCount = groupedChangelog.find(g => g.version === version.version)?.changes.length || 0;
                        return (
                          <TableRow key={version.id}>
                            <TableCell className="text-muted-foreground">
                              {versions.length - index}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Tag className="h-4 w-4 text-primary" />
                                <span className="font-mono font-semibold">v{version.version}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-xs">
                                {version.revision}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                {new Date(version.release_date).toLocaleDateString('id-ID', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </div>
                            </TableCell>
                            <TableCell>
                              {version.is_current ? (
                                <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Aktif
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-muted-foreground">
                                  Arsip
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline">
                                {changeCount} perubahan
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Version Timeline */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5" />
                  Timeline Versi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  {versions.map((version, index) => {
                    const changeCount = groupedChangelog.find(g => g.version === version.version)?.changes.length || 0;
                    const changes = groupedChangelog.find(g => g.version === version.version)?.changes || [];
                    
                    return (
                      <div key={version.id} className="relative pl-8 pb-8 last:pb-0">
                        {/* Timeline line */}
                        {index < versions.length - 1 && (
                          <div className="absolute left-3 top-6 w-0.5 h-full bg-border" />
                        )}
                        
                        {/* Timeline dot */}
                        <div className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center ${
                          version.is_current 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted border-2 border-border'
                        }`}>
                          {version.is_current ? (
                            <Sparkles className="h-3 w-3" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-mono font-bold text-lg">v{version.version}</span>
                            <Badge variant="outline" className="font-mono text-xs">
                              rev.{version.revision}
                            </Badge>
                            {version.is_current && (
                              <Badge className="bg-primary/10 text-primary border-primary/20">
                                Versi Aktif
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {new Date(version.release_date).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </span>
                            <span>•</span>
                            <span>{changeCount} perubahan</span>
                          </div>
                          
                          {/* Show first few changes */}
                          {changes.length > 0 && (
                            <div className="mt-2 pl-2 border-l-2 border-muted space-y-1">
                              {changes.slice(0, 3).map((change) => (
                                <div key={change.id} className="flex items-center gap-2 text-sm">
                                  {getChangeIcon(change.type)}
                                  <span className="text-muted-foreground line-clamp-1">
                                    {change.description}
                                  </span>
                                </div>
                              ))}
                              {changes.length > 3 && (
                                <span className="text-xs text-muted-foreground">
                                  +{changes.length - 3} perubahan lainnya
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Changelog;
