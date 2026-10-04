import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sanitize string to prevent XSS
function sanitizeString(str: string | null | undefined): string | null {
  if (!str) return null;
  return str
    .toString()
    .trim()
    .slice(0, 500) // Limit length
    .replace(/[<>]/g, "") // Remove potential HTML tags
    .replace(/javascript:/gi, "") // Remove javascript: URLs
    .replace(/on\w+=/gi, ""); // Remove event handlers
}

// Validate phone number format
function validatePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.toString().replace(/[^0-9+\-\s]/g, "").slice(0, 20);
  return cleaned || null;
}

// Validate date format (YYYY-MM-DD)
function validateDate(date: any): string | null {
  if (!date) return null;
  
  // Handle Excel serial date
  if (typeof date === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const parsedDate = new Date(excelEpoch.getTime() + date * 24 * 60 * 60 * 1000);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().split("T")[0];
    }
    return null;
  }
  
  // Handle string date
  if (typeof date === "string") {
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
  }
  
  return null;
}

// Validate gender
function validateGender(gender: string | null | undefined): string | null {
  if (!gender) return null;
  const g = gender.toString().trim().toUpperCase();
  if (g === "L" || g === "P") return g;
  if (g === "LAKI-LAKI" || g === "MALE") return "L";
  if (g === "PEREMPUAN" || g === "FEMALE") return "P";
  return null;
}

// Validate grade (1-12)
function validateGrade(grade: any): number | null {
  if (!grade) return null;
  const num = parseInt(grade.toString());
  if (isNaN(num) || num < 1 || num > 12) return null;
  return num;
}

// Validate day of week (1-7)
function validateDayOfWeek(day: any): number | null {
  if (!day) return null;
  const num = parseInt(day.toString());
  if (isNaN(num) || num < 1 || num > 7) return null;
  return num;
}

// Validate time format (HH:MM or HH:MM:SS)
function validateTime(time: any): string | null {
  if (!time) return null;
  const str = time.toString().trim();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

// Validate semester (1 or 2)
function validateSemester(semester: any): number {
  if (!semester) return 1;
  const num = parseInt(semester.toString());
  if (num === 1 || num === 2) return num;
  return 1;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get user and verify role
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!roleData || roleData.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Only admins can import data" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { type, data } = await req.json();

    if (!type || !data || !Array.isArray(data)) {
      return new Response(
        JSON.stringify({ error: "Invalid request: type and data array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (data.length > 1000) {
      return new Response(
        JSON.stringify({ error: "Maximum 1000 records per import" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let validatedData: any[] = [];
    let errors: string[] = [];

    switch (type) {
      case "students": {
        // Get existing classes for lookup
        const { data: classes } = await supabaseAdmin
          .from("classes")
          .select("id, name");

        const classMap = new Map(classes?.map(c => [c.name, c.id]) || []);

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const rowNum = i + 2; // Excel row (1-indexed + header)

          const nis = sanitizeString(row["NIS"]);
          const nisn = sanitizeString(row["NISN"]);
          const fullName = sanitizeString(row["Nama Lengkap"]);
          const rombelName = sanitizeString(row["Rombel"]);
          const gender = validateGender(row["Jenis Kelamin"]);
          const birthPlace = sanitizeString(row["Tempat Lahir"]);
          const birthDate = validateDate(row["Tanggal Lahir"]);
          const address = sanitizeString(row["Alamat"]);
          const parentName = sanitizeString(row["Nama Orang Tua"]);
          const parentPhone = validatePhone(row["No. HP Orang Tua"]);

          if (!nis) {
            errors.push(`Baris ${rowNum}: NIS tidak boleh kosong`);
            continue;
          }

          if (!fullName) {
            errors.push(`Baris ${rowNum}: Nama Lengkap tidak boleh kosong`);
            continue;
          }

          if (!rombelName) {
            errors.push(`Baris ${rowNum}: Rombel tidak boleh kosong`);
            continue;
          }

          const classId = classMap.get(rombelName);
          if (!classId) {
            errors.push(`Baris ${rowNum}: Kelas "${rombelName}" tidak ditemukan`);
            continue;
          }

          validatedData.push({
            nis,
            nisn,
            full_name: fullName,
            gender,
            birth_place: birthPlace,
            birth_date: birthDate,
            address,
            parent_name: parentName,
            parent_phone: parentPhone,
            class_id: classId,
          });
        }
        break;
      }

      case "classes": {
        // Get existing teachers for lookup
        const { data: teachers } = await supabaseAdmin
          .from("teachers")
          .select("id, nip");

        const teacherMap = new Map(teachers?.map(t => [t.nip, t.id]) || []);

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const rowNum = i + 2;

          const name = sanitizeString(row["Nama Rombel"]);
          const grade = validateGrade(row["Tingkat"]);
          const academicYear = sanitizeString(row["Tahun Ajaran"]);
          const homeroomNip = sanitizeString(row["NIP Wali Kelas"]);

          if (!name) {
            errors.push(`Baris ${rowNum}: Nama Rombel tidak boleh kosong`);
            continue;
          }

          if (!grade) {
            errors.push(`Baris ${rowNum}: Tingkat tidak valid (harus 1-12)`);
            continue;
          }

          if (!academicYear) {
            errors.push(`Baris ${rowNum}: Tahun Ajaran tidak boleh kosong`);
            continue;
          }

          let homeroomTeacherId = null;
          if (homeroomNip) {
            homeroomTeacherId = teacherMap.get(homeroomNip) || null;
          }

          validatedData.push({
            name,
            grade,
            academic_year: academicYear,
            homeroom_teacher_id: homeroomTeacherId,
          });
        }
        break;
      }

      case "schedules": {
        // Get existing classes and teachers for lookup
        const { data: classes } = await supabaseAdmin
          .from("classes")
          .select("id, name");

        const { data: teachers } = await supabaseAdmin
          .from("teachers")
          .select("id, nip");

        const classMap = new Map(classes?.map(c => [c.name, c.id]) || []);
        const teacherMap = new Map(teachers?.map(t => [t.nip, t.id]) || []);

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const rowNum = i + 2;

          const dayOfWeek = validateDayOfWeek(row["Hari (1-7)"]);
          const className = sanitizeString(row["Kelas"]);
          const subject = sanitizeString(row["Mata Pelajaran"]);
          const teacherNip = sanitizeString(row["NIP Guru"]);
          const startTime = validateTime(row["Jam Mulai"]);
          const endTime = validateTime(row["Jam Selesai"]);
          const semester = validateSemester(row["Semester"]);
          const academicYear = sanitizeString(row["Tahun Ajaran"]);

          if (!dayOfWeek) {
            errors.push(`Baris ${rowNum}: Hari tidak valid (harus 1-7)`);
            continue;
          }

          if (!className) {
            errors.push(`Baris ${rowNum}: Kelas tidak boleh kosong`);
            continue;
          }

          if (!subject) {
            errors.push(`Baris ${rowNum}: Mata Pelajaran tidak boleh kosong`);
            continue;
          }

          if (!teacherNip) {
            errors.push(`Baris ${rowNum}: NIP Guru tidak boleh kosong`);
            continue;
          }

          if (!startTime || !endTime) {
            errors.push(`Baris ${rowNum}: Format waktu tidak valid (HH:MM)`);
            continue;
          }

          if (!academicYear) {
            errors.push(`Baris ${rowNum}: Tahun Ajaran tidak boleh kosong`);
            continue;
          }

          const classId = classMap.get(className);
          if (!classId) {
            errors.push(`Baris ${rowNum}: Kelas "${className}" tidak ditemukan`);
            continue;
          }

          const teacherId = teacherMap.get(teacherNip);
          if (!teacherId) {
            errors.push(`Baris ${rowNum}: Guru dengan NIP "${teacherNip}" tidak ditemukan`);
            continue;
          }

          validatedData.push({
            day_of_week: dayOfWeek,
            class_id: classId,
            subject,
            teacher_id: teacherId,
            start_time: startTime,
            end_time: endTime,
            semester,
            academic_year: academicYear,
          });
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown import type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // If there are critical errors and no valid data, return error
    if (validatedData.length === 0 && errors.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: "Validation failed",
          errors: errors.slice(0, 10), // Return first 10 errors
          totalErrors: errors.length
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert validated data
    let insertedCount = 0;
    let insertError = null;

    switch (type) {
      case "students": {
        const { data: inserted, error } = await supabaseAdmin
          .from("students")
          .insert(validatedData)
          .select("id");
        insertedCount = inserted?.length || 0;
        insertError = error;
        break;
      }
      case "classes": {
        const { data: inserted, error } = await supabaseAdmin
          .from("classes")
          .insert(validatedData)
          .select("id");
        insertedCount = inserted?.length || 0;
        insertError = error;
        
        // Update homeroom teacher flags
        for (const cls of validatedData) {
          if (cls.homeroom_teacher_id) {
            await supabaseAdmin
              .from("teachers")
              .update({ is_homeroom_teacher: true })
              .eq("id", cls.homeroom_teacher_id);
          }
        }
        break;
      }
      case "schedules": {
        const { data: inserted, error } = await supabaseAdmin
          .from("schedules")
          .insert(validatedData)
          .select("id");
        insertedCount = inserted?.length || 0;
        insertError = error;
        break;
      }
    }

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ 
          error: `Database error: ${insertError.message}`,
          errors,
          validatedCount: validatedData.length
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Import successful: ${insertedCount} ${type} inserted by user ${user.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        insertedCount,
        errors: errors.slice(0, 10),
        totalErrors: errors.length,
        totalProcessed: data.length
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Import validation error:", error);
    return new Response(
      JSON.stringify({ error: "Terjadi kesalahan server" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
