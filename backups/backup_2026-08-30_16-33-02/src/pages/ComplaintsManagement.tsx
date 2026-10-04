import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Shield, MessageSquare, Lightbulb, Eye, Trash2, Filter, FileDown, Search, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF } from '@/lib/pdfLetterhead';

interface Complaint {
  id: string;
  type: 'kekerasan' | 'kritik' | 'saran';
  title: string;
  description: string;
  reporter_name: string | null;
  reporter_contact: string | null;
  is_anonymous: boolean;
  status: 'pending' | 'in_review' | 'resolved';
  created_at: string;
  responded_by: string | null;
  response_notes: string | null;
  response_date: string | null;
}

export default function ComplaintsManagement() {
  const queryClient = useQueryClient();
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [responseNotes, setResponseNotes] = useState('');
  const [newStatus, setNewStatus] = useState<string>('');
  const itemsPerPage = 10;

  const { data: complaints = [], isLoading } = useQuery({
    queryKey: ['complaints'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaints')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Complaint[];
    },
  });

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Filter and search logic
  const filteredComplaints = useMemo(() => {
    let filtered = complaints;

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }

    // Filter by type
    if (typeFilter !== 'all') {
      filtered = filtered.filter((c) => c.type === typeFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.title.toLowerCase().includes(query) ||
          c.description.toLowerCase().includes(query) ||
          c.reporter_name?.toLowerCase().includes(query)
      );
    }

    // Filter by date range
    if (startDate) {
      filtered = filtered.filter(
        (c) => new Date(c.created_at) >= new Date(startDate)
      );
    }
    if (endDate) {
      filtered = filtered.filter(
        (c) => new Date(c.created_at) <= new Date(endDate + 'T23:59:59')
      );
    }

    return filtered;
  }, [complaints, statusFilter, typeFilter, searchQuery, startDate, endDate]);

  // Pagination logic
  const totalPages = Math.ceil(filteredComplaints.length / itemsPerPage);
  const paginatedComplaints = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredComplaints.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredComplaints, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [statusFilter, typeFilter, searchQuery, startDate, endDate]);

  const updateComplaintMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      response_notes,
    }: {
      id: string;
      status: string;
      response_notes: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('complaints')
        .update({
          status,
          response_notes,
          responded_by: userData.user?.id,
          response_date: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints'] });
      toast.success('Pengaduan berhasil diperbarui');
      setSelectedComplaint(null);
      setResponseNotes('');
      setNewStatus('');
    },
    onError: (error: any) => {
      toast.error('Gagal memperbarui pengaduan: ' + error.message);
    },
  });

  const deleteComplaintMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('complaints').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints'] });
      toast.success('Pengaduan berhasil dihapus');
    },
    onError: (error: any) => {
      toast.error('Gagal menghapus pengaduan: ' + error.message);
    },
  });

  const handleUpdate = () => {
    if (!selectedComplaint) return;
    
    if (!newStatus) {
      toast.error('Pilih status baru');
      return;
    }

    updateComplaintMutation.mutate({
      id: selectedComplaint.id,
      status: newStatus,
      response_notes: responseNotes.trim(),
    });
  };

  const exportToPDF = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Add letterhead with full settings
      const letterheadSettings = schoolSettings ? {
        school_name: schoolSettings.school_name,
        district_name: schoolSettings.district_name || '',
        school_address: schoolSettings.school_address || '',
        school_phone: schoolSettings.school_phone || '',
        logo_url: schoolSettings.logo_url || '',
        right_logo_url: schoolSettings.right_logo_url || '',
        header_font_size: schoolSettings.header_font_size || 14,
        subheader_font_size: schoolSettings.subheader_font_size || 10,
        district_font_size: schoolSettings.district_font_size || 12,
        district_font_style: schoolSettings.district_font_style || 'bold',
        school_line_spacing: schoolSettings.school_line_spacing || 6,
        district_line_spacing: schoolSettings.district_line_spacing || 5,
        logo_width: schoolSettings.logo_width || 20,
        logo_height: schoolSettings.logo_height || 20,
        logo_position_x: schoolSettings.logo_position_x || 14,
        logo_position_y: schoolSettings.logo_position_y || 10,
        right_logo_width: schoolSettings.right_logo_width || 20,
        right_logo_height: schoolSettings.right_logo_height || 20,
        right_logo_position_x: schoolSettings.right_logo_position_x || pageWidth - 34,
        right_logo_position_y: schoolSettings.right_logo_position_y || 10,
        show_address: schoolSettings.show_address ?? true,
        show_phone: schoolSettings.show_phone ?? true,
        watermark_enabled: schoolSettings.watermark_enabled ?? false,
        watermark_url: schoolSettings.watermark_url || '',
        watermark_opacity: schoolSettings.watermark_opacity || 10,
        watermark_size: schoolSettings.watermark_size || 100,
        watermark_position: schoolSettings.watermark_position || 'center',
      } : null;
      
      let yPos = await addLetterheadToPDF(doc, letterheadSettings);

      // Title
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('REKAP DATA PENGADUAN', doc.internal.pageSize.getWidth() / 2, yPos, { align: 'center' });
      yPos += 8;
      
      // Metadata
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Tanggal Cetak: ${format(new Date(), 'dd MMMM yyyy, HH:mm', { locale: idLocale })}`, 14, yPos);
      yPos += 5;
      doc.text(`Total Pengaduan: ${filteredComplaints.length}`, 14, yPos);
      yPos += 5;
      
      // Filter info
      if (statusFilter !== 'all') {
        doc.text(`Filter Status: ${statusLabels[statusFilter as keyof typeof statusLabels]}`, 14, yPos);
        yPos += 5;
      }
      if (typeFilter !== 'all') {
        doc.text(`Filter Jenis: ${typeLabels[typeFilter as keyof typeof typeLabels]}`, 14, yPos);
        yPos += 5;
      }
      if (startDate || endDate) {
        const dateRange = `${startDate ? format(parseISO(startDate), 'dd/MM/yyyy') : '...'} - ${endDate ? format(parseISO(endDate), 'dd/MM/yyyy') : '...'}`;
        doc.text(`Periode: ${dateRange}`, 14, yPos);
        yPos += 5;
      }

      // Table
      autoTable(doc, {
        startY: yPos + 3,
        head: [['Tanggal', 'Jenis', 'Judul', 'Pelapor', 'Status']],
        body: filteredComplaints.map((c) => [
          format(new Date(c.created_at), 'dd/MM/yyyy'),
          typeLabels[c.type],
          c.title.length > 40 ? c.title.substring(0, 40) + '...' : c.title,
          c.is_anonymous ? 'Anonim' : c.reporter_name || '-',
          statusLabels[c.status],
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246], fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 25 },
          1: { halign: 'center', cellWidth: 25 },
          2: { cellWidth: 70 },
          3: { cellWidth: 35 },
          4: { halign: 'center', cellWidth: 25 },
        },
      });

      // Save PDF
      doc.save(`rekap-pengaduan-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('PDF berhasil diunduh');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Gagal membuat PDF');
    }
  };

  const typeIcons = {
    kekerasan: Shield,
    kritik: MessageSquare,
    saran: Lightbulb,
  };

  const typeColors = {
    kekerasan: 'bg-destructive/10 text-destructive border-destructive/30',
    kritik: 'bg-warning/10 text-warning border-warning/30',
    saran: 'bg-success/10 text-success border-success/30',
  };

  const statusColors = {
    pending: 'bg-warning/10 text-warning border-warning/30',
    in_review: 'bg-primary/10 text-primary border-primary/30',
    resolved: 'bg-success/10 text-success border-success/30',
  };

  const statusLabels = {
    pending: 'Menunggu',
    in_review: 'Ditinjau',
    resolved: 'Selesai',
  };

  const typeLabels = {
    kekerasan: 'Kekerasan',
    kritik: 'Kritik',
    saran: 'Saran',
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Manajemen Pengaduan</h1>
          <p className="text-muted-foreground mt-2">
            Kelola pengaduan kekerasan, kritik, dan saran dari warga sekolah
          </p>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filter & Pencarian:</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari judul, deskripsi, atau nama..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="pending">Menunggu</SelectItem>
                  <SelectItem value="in_review">Ditinjau</SelectItem>
                  <SelectItem value="resolved">Selesai</SelectItem>
                </SelectContent>
              </Select>

              {/* Type Filter */}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Jenis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Jenis</SelectItem>
                  <SelectItem value="kekerasan">Kekerasan</SelectItem>
                  <SelectItem value="kritik">Kritik</SelectItem>
                  <SelectItem value="saran">Saran</SelectItem>
                </SelectContent>
              </Select>

              {/* Start Date */}
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  placeholder="Tanggal Mulai"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* End Date */}
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  placeholder="Tanggal Selesai"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Export Button */}
              <Button
                onClick={exportToPDF}
                variant="outline"
                className="w-full"
                disabled={filteredComplaints.length === 0}
              >
                <FileDown className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <Badge variant="outline" className="text-sm">
                Menampilkan {paginatedComplaints.length} dari {filteredComplaints.length} pengaduan
              </Badge>
              
              {(statusFilter !== 'all' || typeFilter !== 'all' || searchQuery || startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter('all');
                    setTypeFilter('all');
                    setSearchQuery('');
                    setStartDate('');
                    setEndDate('');
                  }}
                >
                  Reset Filter
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Complaints Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Judul</TableHead>
                <TableHead>Pelapor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Memuat data...
                  </TableCell>
                </TableRow>
              ) : paginatedComplaints.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {filteredComplaints.length === 0
                      ? 'Tidak ada pengaduan'
                      : 'Tidak ada hasil untuk filter ini'}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedComplaints.map((complaint, index) => {
                  const Icon = typeIcons[complaint.type];
                  return (
                    <TableRow key={complaint.id}>
                      <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                      <TableCell className="font-medium">
                        {format(new Date(complaint.created_at), 'dd MMM yyyy', {
                          locale: idLocale,
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={typeColors[complaint.type]}>
                          <Icon className="h-3 w-3 mr-1" />
                          {typeLabels[complaint.type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {complaint.title}
                      </TableCell>
                      <TableCell>
                        {complaint.is_anonymous ? (
                          <span className="text-muted-foreground italic">Anonim</span>
                        ) : (
                          complaint.reporter_name || '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[complaint.status]}>
                          {statusLabels[complaint.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedComplaint(complaint)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm('Yakin ingin menghapus pengaduan ini?')) {
                                deleteComplaintMutation.mutate(complaint.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  // Show first page, last page, current page, and pages around current
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return (
                      <PaginationItem key={page}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    );
                  }
                  return null;
                })}

                <PaginationItem>
                  <PaginationNext
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedComplaint} onOpenChange={() => setSelectedComplaint(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Pengaduan</DialogTitle>
            <DialogDescription>
              Tinjau dan tanggapi pengaduan dari warga sekolah
            </DialogDescription>
          </DialogHeader>

          {selectedComplaint && (
            <div className="space-y-6 mt-4">
              {/* Complaint Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {(() => {
                    const Icon = typeIcons[selectedComplaint.type];
                    return (
                      <Badge variant="outline" className={typeColors[selectedComplaint.type]}>
                        <Icon className="h-3 w-3 mr-1" />
                        {typeLabels[selectedComplaint.type]}
                      </Badge>
                    );
                  })()}
                  <Badge variant="outline" className={statusColors[selectedComplaint.status]}>
                    {statusLabels[selectedComplaint.status]}
                  </Badge>
                </div>

                <div>
                  <h3 className="font-semibold text-lg">{selectedComplaint.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Dikirim pada {format(new Date(selectedComplaint.created_at), 'dd MMMM yyyy, HH:mm', { locale: idLocale })}
                  </p>
                </div>

                <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                  <p className="text-sm whitespace-pre-wrap">{selectedComplaint.description}</p>
                </div>

                {/* Reporter Info */}
                <div className="p-4 bg-card border border-border/50 rounded-lg">
                  <h4 className="font-semibold text-sm mb-3">Informasi Pelapor</h4>
                  {selectedComplaint.is_anonymous ? (
                    <p className="text-sm text-muted-foreground italic">
                      Pengaduan ini dikirim secara anonim
                    </p>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Nama:</span>{' '}
                        {selectedComplaint.reporter_name || '-'}
                      </div>
                      <div>
                        <span className="font-medium">Kontak:</span>{' '}
                        {selectedComplaint.reporter_contact || '-'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Previous Response */}
                {selectedComplaint.response_notes && (
                  <div className="p-4 bg-primary/5 border border-primary/30 rounded-lg">
                    <h4 className="font-semibold text-sm mb-2">Tanggapan Sebelumnya</h4>
                    <p className="text-sm whitespace-pre-wrap mb-2">
                      {selectedComplaint.response_notes}
                    </p>
                    {selectedComplaint.response_date && (
                      <p className="text-xs text-muted-foreground">
                        Ditanggapi pada{' '}
                        {format(new Date(selectedComplaint.response_date), 'dd MMMM yyyy, HH:mm', { locale: idLocale })}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Response Form */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-semibold">Tanggapi Pengaduan</h4>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status Baru</label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Menunggu</SelectItem>
                      <SelectItem value="in_review">Ditinjau</SelectItem>
                      <SelectItem value="resolved">Selesai</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Catatan Tanggapan</label>
                  <Textarea
                    value={responseNotes}
                    onChange={(e) => setResponseNotes(e.target.value)}
                    placeholder="Tulis catatan atau tindak lanjut yang telah dilakukan..."
                    rows={4}
                  />
                </div>

                <Button
                  onClick={handleUpdate}
                  disabled={updateComplaintMutation.isPending}
                  className="w-full"
                >
                  {updateComplaintMutation.isPending ? 'Menyimpan...' : 'Simpan Tanggapan'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
