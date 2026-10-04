import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown, GraduationCap } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { HighlightText } from "@/components/HighlightText";
import { Skeleton } from "@/components/ui/skeleton";

export default function Alumni() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"name" | "nis" | "graduation_date" | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const { data: alumni, isLoading } = useQuery({
    queryKey: ["alumni"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("is_alumni", true)
        .order("graduation_date", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const handleSort = (field: "name" | "nis" | "graduation_date") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const filteredAndSortedAlumni = useMemo(() => {
    if (!alumni) return [];

    let filtered = alumni.filter((student) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        student.full_name.toLowerCase().includes(searchLower) ||
        student.nis.toLowerCase().includes(searchLower) ||
        (student.nisn && student.nisn.toLowerCase().includes(searchLower))
      );
    });

    if (sortField) {
      filtered.sort((a, b) => {
        let aValue: string | number = "";
        let bValue: string | number = "";

        if (sortField === "name") {
          aValue = a.full_name;
          bValue = b.full_name;
        } else if (sortField === "nis") {
          aValue = a.nis;
          bValue = b.nis;
        } else if (sortField === "graduation_date") {
          aValue = a.graduation_date || "";
          bValue = b.graduation_date || "";
        }

        if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
        if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [alumni, searchTerm, sortField, sortOrder]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Data Alumni</h1>
          </div>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            Total: {filteredAndSortedAlumni.length} Alumni
          </Badge>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Cari alumni (nama, NIS, NISN)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("nis")}
                    className="hover:bg-transparent p-0 h-auto font-semibold"
                  >
                    NIS
                    <ArrowUpDown
                      className={`ml-2 h-4 w-4 ${
                        sortField === "nis" ? "text-primary" : ""
                      }`}
                    />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("name")}
                    className="hover:bg-transparent p-0 h-auto font-semibold"
                  >
                    Nama Lengkap
                    <ArrowUpDown
                      className={`ml-2 h-4 w-4 ${
                        sortField === "name" ? "text-primary" : ""
                      }`}
                    />
                  </Button>
                </TableHead>
                <TableHead>NISN</TableHead>
                <TableHead>Jenis Kelamin</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("graduation_date")}
                    className="hover:bg-transparent p-0 h-auto font-semibold"
                  >
                    Tanggal Kelulusan
                    <ArrowUpDown
                      className={`ml-2 h-4 w-4 ${
                        sortField === "graduation_date" ? "text-primary" : ""
                      }`}
                    />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredAndSortedAlumni.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Tidak ada data alumni
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedAlumni.map((student, index) => (
                  <TableRow key={student.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      <HighlightText text={student.nis} searchTerm={searchTerm} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <HighlightText
                        text={student.full_name}
                        searchTerm={searchTerm}
                      />
                    </TableCell>
                    <TableCell>
                      <HighlightText
                        text={student.nisn || "-"}
                        searchTerm={searchTerm}
                      />
                    </TableCell>
                    <TableCell>
                      {student.gender === "L" ? "Laki-laki" : "Perempuan"}
                    </TableCell>
                    <TableCell>
                      {student.graduation_date
                        ? format(new Date(student.graduation_date), "dd MMMM yyyy", {
                            locale: id,
                          })
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
