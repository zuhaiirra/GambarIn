
// =====================================
// KONEKSI DATABASE GAMBARIN!
// =====================================

const supabaseUrl = "https://ipfluhoiwibedcouypyy.supabase.co";
const supabaseKey = "sb_publishable_Gp1Nngbw5qLT4NXv6LCIUg_XqG5sWqu";

// =====================================
// CEK LIBRARY SUPABASE
// =====================================

(function initSupabaseClient() {
    try {
        if (!window.supabase || typeof window.supabase.createClient !== "function") {
            console.error("Library Supabase gagal dimuat. Pastikan CDN supabase-js dapat diakses.");
            window.supabaseClient = null;
            window.supabaseClientError = new Error("Library Supabase gagal dimuat. Periksa koneksi internet atau akses ke CDN Supabase.");
            return;
        }

        window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        window.supabaseClientError = null;
        console.log("Supabase berhasil terhubung!");
    } catch (error) {
        console.error("Gagal membuat Supabase client:", error);
        window.supabaseClient = null;
        window.supabaseClientError = error;
    }
})();

// Alias global untuk kompatibilitas script lain
var supabaseClient = window.supabaseClient;
