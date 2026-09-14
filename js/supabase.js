// ============================================================
// CONFIGURACIÓN DE SUPABASE
// ============================================================
// 1. Ve a tu proyecto en https://supabase.com/dashboard
// 2. Entra a "Project Settings" > "API"
// 3. Copia "Project URL" y pégalo en SUPABASE_URL
// 4. Copia la clave "anon public" y pégala en SUPABASE_ANON_KEY
//
// IMPORTANTE: nunca coloques aquí la "service_role key".
// La anon key es segura para el frontend porque Row Level
// Security (RLS) controla exactamente qué puede hacer.
// ============================================================

const SUPABASE_URL = 'https://vvokdvfcxgigasiduevt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2b2tkdmZjeGdpZ2FzaWR1ZXZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNDc1MDEsImV4cCI6MjEwNDkyMzUwMX0.H8dy77PIW0HfS5D47yuxtMGirriebg6t4Crw5El6gWw';

// El SDK de Supabase se carga desde el CDN en index.html / login.html
// (window.supabase lo provee ese script). Aquí creamos el cliente
// una sola vez y lo dejamos disponible como window.db para todos
// los demás archivos JS del proyecto.
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.db = db;
