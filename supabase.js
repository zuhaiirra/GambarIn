
// =====================================
// KONEKSI DATABASE GAMBARIN!
// =====================================

const supabaseUrl = "https://ipfluhoiwibedcouypyy.supabase.co";
const supabaseKey = "sb_publishable_Gp1Nngbw5qLT4NXv6LCIUg_XqG5sWqu";

// =====================================
// INISIALISASI SUPABASE
// =====================================

(function () {
    try {
        if (
            !window.supabase ||
            typeof window.supabase.createClient !== "function"
        ) {
            throw new Error("Library Supabase gagal dimuat.");
        }

        window.supabaseClient = window.supabase.createClient(
            supabaseUrl,
            supabaseKey
        );

        // Membuat variabel global agar bisa dipakai buyer.js,
        // seller.js, admin.js, dan script lainnya.
        window.supabaseClientError = null;

        console.log("Supabase client berhasil dibuat!");

    } catch (error) {
        window.supabaseClient = null;
        window.supabaseClientError = error;

        console.error("Gagal membuat Supabase client:", error);
    }
})();

// Alias global untuk script yang menggunakan supabaseClient langsung.
var supabaseClient = window.supabaseClient;
