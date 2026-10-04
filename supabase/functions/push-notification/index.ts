import { createClient } from 'npm:@supabase/supabase-js@2';
import { google } from 'npm:googleapis';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Firebase Service Account (disimpan sebagai JSON di environment variable)
const serviceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!);

Deno.serve(async (req) => {
  try {
    const { student_id, title, body } = await req.json();

    // Ambil token FCM dari database
    const { data: tokenData } = await supabase
      .from('push_tokens')
      .select('fcm_token')
      .eq('student_id', student_id)
      .single();

    if (!tokenData?.fcm_token) {
      return new Response(JSON.stringify({ error: 'Token not found' }), { status: 404 });
    }

    // Kirim notifikasi ke Firebase
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });

    const messaging = google.fcm({ version: 'v1', auth });
    const message = {
      token: tokenData.fcm_token,
      notification: {
        title,
        body,
      },
    };

    await messaging.projects.messages.send({
      parent: `projects/${serviceAccount.project_id}`,
      requestBody: message,
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
