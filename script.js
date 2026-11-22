
// =====================================
// GAMBARIN! - AUTHENTICATION SYSTEM
// + DYNAMIC ARTWORK CATALOG
// + FILTER ARTWORK YANG DIARSIPKAN
// =====================================

const modal = document.createElement("div");
modal.classList.add("modal");
document.body.appendChild(modal);

let selectedArtwork = null;

function getSupabase() {
    const client = window.supabaseClient || (typeof supabaseClient !== "undefined" ? supabaseClient : null);
    if (!client) {
        throw window.supabaseClientError || new Error("Supabase client belum tersedia. Pastikan koneksi internet aktif dan CDN Supabase dapat dimuat.");
    }
    return client;
}

// =====================================
// 1. HELPER CEK SESSION
// =====================================

async function getCurrentUser() {
    const sb = window.supabaseClient || (typeof supabaseClient !== "undefined" ? supabaseClient : null);
    if (!sb) return null;

    try {
        const { data, error } = await sb.auth.getSession();

        if (error) {
            const errorMessage = error.message?.toLowerCase() || "";
            if (
                errorMessage.includes("session missing") ||
                errorMessage.includes("auth session missing")
            ) {
                return null;
            }
            throw error;
        }

        return data?.session?.user || null;
    } catch (error) {
        const errorMessage = error.message?.toLowerCase() || "";
        if (
            errorMessage.includes("session missing") ||
            errorMessage.includes("auth session missing")
        ) {
            return null;
        }
        console.error("Gagal memeriksa session:", error);
        return null;
    }
}

// =====================================
// 2. CEK ROLE & REDIRECT
// =====================================

async function redirectByRole(user) {
    if (!user) return;
    const sb = window.supabaseClient || (typeof supabaseClient !== "undefined" ? supabaseClient : null);
    if (!sb) return;

    const { data: profile, error } = await sb
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .single();

    if (error || !profile) {
        console.error(
            "Gagal mengambil profil:",
            error?.message || "Profil tidak ditemukan."
        );
        return;
    }

    if (profile.role === "seller") {
        window.location.replace("seller.html");
    } else if (profile.role === "buyer") {
        window.location.replace("buyer.html");
    } else if (profile.role === "admin") {
        window.location.replace("admin.html");
    } else {
        console.error("Role tidak dikenali:", profile.role);
    }
}

// =====================================
// 3. TAMPILKAN FORM LOGIN / REGISTER
// =====================================

function showForm(type) {
    let formContent = "";

    if (type === "login") {
        formContent = `
            <h2>Welcome Back!</h2>
            <p>Login untuk melanjutkan ke GambarIn!</p>

            <form id="userForm">
                <label>Email</label>
                <input
                    type="email"
                    id="email"
                    placeholder="Masukkan email"
                    required
                >

                <label>Password</label>
                <input
                    type="password"
                    id="password"
                    placeholder="Masukkan password"
                    required
                >

                <button type="submit" class="modal-submit">
                    Login
                </button>
            </form>

            <p id="formMessage"></p>

            <p class="switch-form">
                Belum punya akun?
                <a href="#" id="switchToRegister">Register</a>
            </p>
        `;
    } else {
        formContent = `
            <h2>Create Account</h2>
            <p>Bergabung dan mulai berkarya bersama GambarIn!</p>

            <form id="userForm">
                <label>Nama Lengkap</label>
                <input
                    type="text"
                    id="fullName"
                    placeholder="Masukkan nama"
                    required
                >

                <label>Email</label>
                <input
                    type="email"
                    id="email"
                    placeholder="Masukkan email"
                    required
                >

                <label>Password</label>
                <input
                    type="password"
                    id="password"
                    placeholder="Buat password (minimal 6 karakter)"
                    minlength="6"
                    required
                >

                <label>Daftar sebagai</label>
                <select id="role" required>
                    <option value="">Pilih peran</option>
                    <option value="buyer">Buyer</option>
                    <option value="seller">Seller</option>
                </select>

                <button type="submit" class="modal-submit">
                    Register
                </button>
            </form>

            <p id="formMessage"></p>

            <p class="switch-form">
                Sudah punya akun?
                <a href="#" id="switchToLogin">Login</a>
            </p>
        `;
    }

    modal.innerHTML = `
        <div class="modal-content">
            <button
                type="button"
                class="close-modal"
                id="closeModal"
            >
                &times;
            </button>

            ${formContent}
        </div>
    `;

    modal.classList.add("active");
    modal.style.display = "flex";

    document.getElementById("closeModal")
        .addEventListener("click", closeForm);

    const switchToRegister =
        document.getElementById("switchToRegister");

    const switchToLogin =
        document.getElementById("switchToLogin");

    if (switchToRegister) {
        switchToRegister.addEventListener("click", event => {
            event.preventDefault();
            showForm("register");
        });
    }

    if (switchToLogin) {
        switchToLogin.addEventListener("click", event => {
            event.preventDefault();
            showForm("login");
        });
    }

    document.getElementById("userForm")
        .addEventListener("submit", handleAuth);
}

// =====================================
// 4. LOGIN & REGISTER
// =====================================

async function handleAuth(event) {
    event.preventDefault();

    const form = event.target;
    const message = document.getElementById("formMessage");
    const submitButton =
        form.querySelector('button[type="submit"]');

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    message.textContent = "Memproses...";
    submitButton.disabled = true;

    try {
        const sb = getSupabase();
        const fullNameInput = document.getElementById("fullName");

        // REGISTER
        if (fullNameInput) {
            const fullName = fullNameInput.value.trim();
            const role = document.getElementById("role").value;

            if (!["buyer", "seller"].includes(role)) {
                throw new Error("Silakan pilih Buyer atau Seller.");
            }

            const { data, error } = await sb.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                        role: role
                    }
                }
            });

            if (error) throw error;

            if (data.session && data.user) {
                message.textContent = "Registrasi berhasil! Mengarahkan...";
                await redirectByRole(data.user);
            } else {
                message.textContent = "Registrasi berhasil! Silakan cek email untuk verifikasi akun.";
            }
        } else {
            // LOGIN
            const { data, error } = await sb.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            if (!data.user) throw new Error("Data akun tidak ditemukan.");

            message.textContent = "Login berhasil! Mengarahkan...";
            await redirectByRole(data.user);
        }
    } catch (error) {
        console.error("Authentication error:", error);
        message.textContent = "Gagal: " + error.message;

    } finally {
        submitButton.disabled = false;
    }
}

// =====================================
// 5. LOGOUT
// =====================================

async function logoutGambarIn() {
    const confirmed = confirm("Yakin ingin logout?");
    if (!confirmed) return;

    try {
        const sb = getSupabase();
        const { error } = await sb.auth.signOut();
        if (error) throw error;
    } catch (error) {
        alert("Gagal logout: " + (error?.message || "Terjadi kesalahan."));
        return;
    }

    window.location.replace("index.html");
}

// =====================================
// 6. TUTUP MODAL LOGIN / REGISTER
// =====================================

function closeForm() {
    modal.classList.remove("active");
    modal.style.display = "none";
}

// =====================================
// 7. BIND LOGIN & REGISTER BUTTON
// =====================================

function bindAuthButtons() {
    const loginBtn = document.querySelector(".btn-login");
    const registerBtn = document.querySelector(".btn-register");

    if (loginBtn) {
        loginBtn.addEventListener("click", () => {
            showForm("login");
        });
    }

    if (registerBtn) {
        registerBtn.addEventListener("click", () => {
            showForm("register");
        });
    }
}

// =====================================
// 8. UPDATE NAVBAR
// =====================================

async function updateNavbar() {
    const navButtons = document.getElementById("navButtons");

    if (!navButtons) return;

    try {
        const user = await getCurrentUser();

        if (!user) {
            navButtons.innerHTML = `
                <button class="btn-login">Login</button>
                <button class="btn-register">Register</button>
            `;
            bindAuthButtons();
            return;
        }

        const sb = getSupabase();
        const { data: profile, error } = await sb
            .from("profiles")
            .select("full_name, role")
            .eq("id", user.id)
            .single();

        if (error || !profile) {
            console.error("Gagal mengambil profil:", error?.message);
            navButtons.innerHTML = `
                <button class="btn-login">Login</button>
                <button class="btn-register">Register</button>
            `;
            bindAuthButtons();
            return;
        }

        navButtons.innerHTML = "";

        const greeting = document.createElement("span");
        greeting.textContent =
            `Halo, ${profile.full_name || user.email}!`;

        const roleLabel = document.createElement("span");
        roleLabel.textContent = profile.role.toUpperCase();
        roleLabel.classList.add("user-role");

        const logoutBtn = document.createElement("button");
        logoutBtn.textContent = "Logout";
        logoutBtn.classList.add("btn-register");
        logoutBtn.addEventListener("click", logoutGambarIn);

        navButtons.append(greeting, roleLabel, logoutBtn);

    } catch (error) {
        console.error("Gagal memperbarui navbar:", error);
    }
}

// =====================================
// 9. FORMAT HARGA
// =====================================

function formatArtworkPrice(price) {
    return Number(price || 0).toLocaleString("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    });
}

// =====================================
// 10. LOAD ARTWORK DARI SUPABASE
// =====================================

async function loadApprovedArtworks() {
    const container = document.getElementById("artworkContainer");
    if (!container) return;

    container.innerHTML = `
        <div class="artwork-loading">
            Memuat karya dari para kreator...
        </div>
    `;

    try {
        const sb = getSupabase();

        const { data: artworks, error } = await sb
            .from("artworks")
            .select("*")
            .eq("status", "approved")
            .eq("is_archived", false)
            .order("created_at", { ascending: false });

        if (error) throw error;

        if (!artworks || artworks.length === 0) {
            container.innerHTML = `
                <div class="artwork-empty">
                    <h3>Belum ada artwork</h3>
                    <p>
                        Karya dari para kreator akan muncul di sini
                        setelah disetujui oleh Admin.
                    </p>
                </div>
            `;
            return;
        }

        const sellerIds = [
            ...new Set(
                artworks
                    .map(artwork => artwork.seller_id)
                    .filter(Boolean)
            )
        ];

        const sellerMap = {};

        if (sellerIds.length > 0) {
            const { data: sellers, error: sellerError } = await sb
                .from("profiles")
                .select("id, full_name, username, store_name")
                .in("id", sellerIds);

            if (sellerError) {
                console.error("Gagal mengambil profil Seller:", sellerError.message);
            } else if (sellers) {
                sellers.forEach(seller => {
                    sellerMap[seller.id] =
                        seller.store_name ||
                        seller.username ||
                        seller.full_name ||
                        "Digital Artist";
                });
            }
        }

        container.innerHTML = "";

        artworks.forEach(artwork => {
            const sellerName = sellerMap[artwork.seller_id] || "Digital Artist";

            const card = document.createElement("div");
            card.classList.add("artwork-card");
            card.setAttribute("tabindex", "0");
            card.setAttribute("role", "button");
            card.setAttribute("aria-label", `Lihat detail ${artwork.title || "artwork"}`);

            const imageWrapper = document.createElement("div");
            imageWrapper.classList.add("artwork-image");

            const image = document.createElement("img");
            image.src = artwork.image_url || "";
            image.alt = artwork.title || "Artwork";
            image.loading = "lazy";

            image.onerror = () => {
                imageWrapper.innerHTML = `
                    <div class="artwork-empty">
                        Gambar tidak tersedia
                    </div>
                `;
            };

            imageWrapper.appendChild(image);

            const info = document.createElement("div");
            info.classList.add("artwork-info");

            const title = document.createElement("h3");
            title.textContent = artwork.title || "Untitled Artwork";

            const seller = document.createElement("p");
            seller.textContent = `by ${sellerName}`;

            const category = document.createElement("span");
            category.classList.add("artwork-category");
            category.textContent = artwork.category || "Artwork";

            const price = document.createElement("strong");
            price.textContent = formatArtworkPrice(artwork.price);

            info.append(title, seller, category, price);
            card.append(imageWrapper, info);

            card.addEventListener("click", () => {
                openArtworkDetail(artwork, sellerName);
            });

            card.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openArtworkDetail(artwork, sellerName);
                }
            });

            container.appendChild(card);
        });

        console.log(`${artworks.length} artwork berhasil ditampilkan.`);
    } catch (error) {
        console.error("Gagal memuat artwork:", error);
        container.innerHTML = `
            <div class="artwork-error">
                <h3>Gagal memuat artwork</h3>
                <p>${(error && error.message) ? error.message : "Terjadi kesalahan saat memuat data."}</p>
            </div>
        `;
    }
}

// =====================================
// 11. BUAT MODAL DETAIL ARTWORK
// =====================================

function createArtworkDetailModal() {
    if (document.getElementById("artworkDetailModal")) return;

    const detailModal = document.createElement("div");
    detailModal.id = "artworkDetailModal";
    detailModal.classList.add("artwork-detail-modal");

    detailModal.innerHTML = `
        <div class="artwork-detail-content">

            <button
                type="button"
                class="artwork-detail-close"
                id="closeArtworkDetail"
                aria-label="Tutup detail"
            >
                &times;
            </button>

            <div class="artwork-detail-image">
                <img id="detailArtworkImage" src="" alt="Artwork">
            </div>

            <div class="artwork-detail-info">
                <span id="detailArtworkCategory" class="artwork-category"></span>

                <h2 id="detailArtworkTitle"></h2>

                <p id="detailArtworkSeller" class="artwork-detail-seller"></p>

                <p id="detailArtworkDescription"></p>

                <strong
                    id="detailArtworkPrice"
                    class="artwork-detail-price"
                ></strong>

                <button
                    type="button"
                    class="artwork-detail-order"
                    id="orderArtworkButton"
                >
                    Pesan Sekarang
                </button>
            </div>

        </div>
    `;

    document.body.appendChild(detailModal);

    document.getElementById("closeArtworkDetail")
        .addEventListener("click", closeArtworkDetail);

    detailModal.addEventListener("click", event => {
        if (event.target === detailModal) {
            closeArtworkDetail();
        }
    });

    document.getElementById("orderArtworkButton")
        .addEventListener("click", handleArtworkOrder);
}

// =====================================
// 12. BUKA DETAIL ARTWORK
// =====================================

function openArtworkDetail(artwork, sellerName) {
    selectedArtwork = artwork;

    createArtworkDetailModal();

    const detailModal =
        document.getElementById("artworkDetailModal");

    const image =
        document.getElementById("detailArtworkImage");

    image.src = artwork.image_url || "";
    image.alt = artwork.title || "Artwork";

    image.onerror = () => {
        image.alt = "Gambar artwork tidak tersedia";
    };

    document.getElementById("detailArtworkTitle").textContent =
        artwork.title || "Untitled Artwork";

    document.getElementById("detailArtworkSeller").textContent =
        `Created by ${sellerName}`;

    document.getElementById("detailArtworkCategory").textContent =
        artwork.category || "Artwork";

    document.getElementById("detailArtworkDescription").textContent =
        artwork.description || "Belum ada deskripsi untuk karya ini.";

    document.getElementById("detailArtworkPrice").textContent =
        formatArtworkPrice(artwork.price);

    detailModal.classList.add("active");
    document.body.style.overflow = "hidden";
}

// =====================================
// 13. TUTUP DETAIL ARTWORK
// =====================================

function closeArtworkDetail() {
    const detailModal =
        document.getElementById("artworkDetailModal");

    if (detailModal) {
        detailModal.classList.remove("active");
    }

    document.body.style.overflow = "";
}

// =====================================
// 14. TOMBOL PESAN ARTWORK
// =====================================

async function handleArtworkOrder() {
    if (!selectedArtwork) return;

    const orderButton =
        document.getElementById("orderArtworkButton");

    if (orderButton) {
        orderButton.disabled = true;
        orderButton.textContent = "Memeriksa akun...";
    }

    try {
        const user = await getCurrentUser();

        // BELUM LOGIN: TAMPILKAN FORM LOGIN
        if (!user) {
            closeArtworkDetail();
            showForm("login");
            return;
        }

        // SUDAH LOGIN: PERIKSA ROLE
        const sb = getSupabase();
        const { data: profile, error: profileError } = await sb
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        if (profileError || !profile) {
            throw new Error(
                profileError?.message || "Profil pengguna tidak ditemukan."
            );
        }

        if (profile.role === "buyer") {
            window.location.href = "buyer.html";
            return;
        }

        if (profile.role === "seller") {
            alert(
                "Akun Seller tidak dapat melakukan pemesanan. Silakan gunakan akun Buyer."
            );
            return;
        }

        if (profile.role === "admin") {
            alert("Admin tidak dapat melakukan pemesanan artwork.");
            return;
        }

        alert("Role akun tidak dikenali.");

    } catch (error) {
        console.error("Gagal memeriksa akun:", error);
        alert("Gagal memeriksa akun: " + error.message);

    } finally {
        if (orderButton && document.body.contains(orderButton)) {
            orderButton.disabled = false;
            orderButton.textContent = "Pesan Sekarang";
        }
    }
}

// =====================================
// 15. EVENT KEYBOARD MODAL
// =====================================

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeForm();
        closeArtworkDetail();
    }
});

// =====================================
// 16. INITIALIZATION
// =====================================

document.addEventListener("DOMContentLoaded", async () => {
    bindAuthButtons();

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closeForm();
        }
    });

    createArtworkDetailModal();

    await loadApprovedArtworks();

    await updateNavbar();
});
