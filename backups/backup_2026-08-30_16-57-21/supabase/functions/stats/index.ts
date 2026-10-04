import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    let data;

    switch (path) {
      case 'rombel': {
        const { count, error } = await supabase
          .from('classes')
          .select('*', { count: 'exact', head: true });
        
        if (error) throw error;
        data = { jumlah_rombel: count };
        break;
      }
      
      case 'siswa': {
        const { count, error } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true });
        
        if (error) throw error;
        data = { jumlah_siswa: count };
        break;
      }
      
      case 'guru': {
        const { count, error } = await supabase
          .from('teachers')
          .select('*', { count: 'exact', head: true });
        
        if (error) throw error;
        data = { jumlah_guru: count };
        break;
      }
      
      default: {
        // Return all stats
        const [classesResult, studentsResult, teachersResult] = await Promise.all([
          supabase.from('classes').select('*', { count: 'exact', head: true }),
          supabase.from('students').select('*', { count: 'exact', head: true }),
          supabase.from('teachers').select('*', { count: 'exact', head: true })
        ]);

        if (classesResult.error) throw classesResult.error;
        if (studentsResult.error) throw studentsResult.error;
        if (teachersResult.error) throw teachersResult.error;

        data = {
          jumlah_rombel: classesResult.count,
          jumlah_siswa: studentsResult.count,
          jumlah_guru: teachersResult.count
        };
      }
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
