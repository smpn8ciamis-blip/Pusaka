import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { nis, nisn } = await req.json();

    if (!nis && !nisn) {
      return new Response(
        JSON.stringify({ error: "NIS atau NISN harus diisi" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const identifier = nis || nisn;

    // Validate identifier format (alphanumeric, max 20 chars)
    if (!/^[a-zA-Z0-9]{1,20}$/.test(identifier)) {
      return new Response(
        JSON.stringify({ error: "Format NIS/NISN tidak valid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find student by NIS or NISN - only return minimal, non-sensitive data
    const { data: studentData, error: studentError } = await supabaseAdmin
      .from("students")
      .select(`
        id,
        full_name,
        nis,
        nisn,
        is_alumni,
        photo_url,
        class_id,
        classes:class_id (
          id,
          name,
          grade,
          homeroom_teacher_id,
          academic_year
        )
      `)
      .or(`nis.eq.${identifier},nisn.eq.${identifier}`)
      .maybeSingle();

    if (studentError) {
      console.error("Student lookup error:", studentError);
      return new Response(
        JSON.stringify({ error: "Gagal mencari data siswa" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!studentData) {
      return new Response(
        JSON.stringify({ error: "Siswa tidak ditemukan" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get homeroom teacher name (only name, not contact info)
    let homeroomTeacherName = "Belum ada wali kelas";
    const homeroomTeacherId = (studentData.classes as any)?.homeroom_teacher_id;
    
    if (homeroomTeacherId) {
      const { data: teacherData } = await supabaseAdmin
        .from("teachers")
        .select("user_id")
        .eq("id", homeroomTeacherId)
        .maybeSingle();

      if (teacherData?.user_id) {
        const { data: profileData } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", teacherData.user_id)
          .maybeSingle();

        homeroomTeacherName = profileData?.full_name || "Nama tidak ditemukan";
      }
    }

    // Get school settings (only non-sensitive fields)
    const { data: settingsData } = await supabaseAdmin
      .from("school_settings")
      .select("academic_year, active_semester, school_name")
      .limit(1)
      .maybeSingle();

    // Get attendance statistics (only counts, no detailed records)
    const { data: attendanceData } = await supabaseAdmin
      .from("attendance")
      .select(`
        id,
        date,
        status,
        notes,
        schedule_id,
        sched_subject,
        sched_teacher_id,
        schedules:schedule_id (
          subject,
          teacher_id
        )
      `)
      .eq("student_id", studentData.id)
      .order("date", { ascending: false });

    // Get unique teacher IDs for attendance
    const teacherIds = Array.from(
      new Set(
        attendanceData
          ?.map((record: any) => record.schedules?.teacher_id || record.sched_teacher_id)
          .filter(Boolean) || []
      )
    );

    // Fetch teacher names (only names)
    const { data: teachersData } = await supabaseAdmin
      .from("teachers")
      .select(`
        id,
        user_id
      `)
      .in("id", teacherIds);

    // Get teacher profiles
    const teacherUserIds = teachersData?.map(t => t.user_id).filter(Boolean) || [];
    const { data: teacherProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", teacherUserIds);

    // Create teacher map
    const teacherMap = new Map();
    teachersData?.forEach((teacher: any) => {
      const profile = teacherProfiles?.find(p => p.id === teacher.user_id);
      teacherMap.set(teacher.id, profile?.full_name || "Tidak diketahui");
    });

    // Format attendance records
    const attendanceRecords = attendanceData?.map((record: any) => ({
      id: record.id,
      date: record.date,
      status: record.status,
      notes: record.notes,
      subject: record.schedules?.subject || record.sched_subject || "-",
      teacher_name: teacherMap.get(record.schedules?.teacher_id || record.sched_teacher_id) || "-",
    })) || [];

    // Calculate attendance stats
    const hadir = attendanceData?.filter((a: any) => a.status === "hadir").length || 0;
    const sakit = attendanceData?.filter((a: any) => a.status === "sakit").length || 0;
    const izin = attendanceData?.filter((a: any) => a.status === "izin").length || 0;
    const alpa = attendanceData?.filter((a: any) => a.status === "alpa").length || 0;
    const total = attendanceData?.length || 0;
    const percentage = total > 0 ? (hadir / total) * 100 : 0;

    // Get violation statistics
    const { data: violationData } = await supabaseAdmin
      .from("student_violations")
      .select(`
        id,
        violation_date,
        points,
        notes,
        violation_types:violation_type_id (
          name,
          category
        )
      `)
      .eq("student_id", studentData.id)
      .order("violation_date", { ascending: false });

    const violations = violationData?.map((v: any) => ({
      id: v.id,
      violation_date: v.violation_date,
      violation_name: v.violation_types?.name || "-",
      category: v.violation_types?.category || "-",
      points: v.points,
      notes: v.notes,
    })) || [];

    const totalViolationPoints = violations.reduce((sum, v) => sum + v.points, 0);

    // Get achievements
    const { data: achievementData } = await supabaseAdmin
      .from("student_achievements")
      .select(`
        id,
        achievement_date,
        achievement_name,
        achievement_type,
        level,
        description
      `)
      .eq("student_id", studentData.id)
      .order("achievement_date", { ascending: false });

    const achievements = achievementData?.map((a: any) => ({
      id: a.id,
      achievement_date: a.achievement_date,
      achievement_name: a.achievement_name,
      achievement_type: a.achievement_type,
      level: a.level,
      description: a.description,
    })) || [];

    // Get mutation history
    const { data: mutationData } = await supabaseAdmin
      .from("student_mutations")
      .select("id, mutation_date, destination_school, reason, notes")
      .eq("student_id", studentData.id)
      .order("mutation_date", { ascending: false });

    const mutations = mutationData?.map((m: any) => ({
      id: m.id,
      mutation_date: m.mutation_date,
      destination_school: m.destination_school,
      reason: m.reason,
      notes: m.notes,
    })) || [];

    // Return minimal, non-sensitive response
    const response = {
      student: {
        id: studentData.id,
        full_name: studentData.full_name,
        nis: studentData.nis,
        nisn: studentData.nisn,
        is_alumni: studentData.is_alumni,
        photo_url: (studentData as any).photo_url || null,
        class_name: (studentData.classes as any)?.name || "-",
        grade: (studentData.classes as any)?.grade || 0,
        homeroom_teacher: homeroomTeacherName,
        academic_year: settingsData?.academic_year || "Tidak tersedia",
        semester: settingsData?.active_semester || 0,
        school_name: settingsData?.school_name || "Sekolah",
        status: (studentData as any).status || "aktif",
      },
      attendanceStats: { hadir, sakit, izin, alpa, total, percentage },
      attendanceRecords,
      violations,
      totalViolationPoints,
      achievements,
      mutations,
    };

    console.log(`Public student lookup successful for identifier: ${identifier}`);

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Public student lookup error:", error);
    return new Response(
      JSON.stringify({ error: "Terjadi kesalahan server" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
