// =====================================
// KONEKSI DATABASE GAMBARIN!
// =====================================

const supabaseUrl = "https://ipfluhoiwibedcouypyy.supabase.co";
const supabaseKey = "sb_publishable_Gp1Nngbw5qLT4NXv6LCIUg_XqG5sWqu";

console.log("Memeriksa library Supabase...");
console.log("Supabase library:", window.supabase);

try {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
        throw new Error("Library Supabase CDN tidak berhasil dimuat.");
    }

    window.supabaseClient = window.supabase.createClient(
        supabaseUrl,
        supabaseKey
    );

    window.supabaseClientError = null;

    console.log("Supabase client berhasil dibuat!");
} catch (error) {
    window.supabaseClient = null;
    window.supabaseClientError = error;

    console.error("Gagal membuat Supabase client:", error);
}
