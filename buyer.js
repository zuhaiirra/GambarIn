
// =============================================
// GAMBARIN! - BUYER DASHBOARD
// =============================================

let buyerUser = null;
let buyerProfile = null;
let artworkData = [];
let buyerOrders = [];
let selectedArtwork = null;
let favoriteIds = [];
let selectedPaymentOrder = null;

// Informasi pembayaran simulasi untuk UAS
const PAYMENT_ACCOUNTS = {
    bank: {
        name: "Transfer Bank",
        accounts: [
            { bank: "BCA", number: "1234567890", owner: "GambarIn Demo" },
            { bank: "BRI", number: "0987654321", owner: "GambarIn Demo" }
        ]
    },
    ewallet: {
        name: "E-Wallet",
        accounts: [
            { bank: "DANA", number: "081234567890", owner: "GambarIn Demo" },
            { bank: "OVO", number: "081234567890", owner: "GambarIn Demo" }
        ]
    }
};

// =============================================
// HELPER
// =============================================

const $ = (id) => document.getElementById(id);

function rupiah(number) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(Number(number) || 0);
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function safeImage(url) {
    if (!url) return "";

    try {
        const parsed = new URL(url);

        return ["https:", "http:"].includes(parsed.protocol)
            ? parsed.href
            : "";
    } catch {
        return "";
    }
}

function showMessage(id, message, success = true) {
    const element = $(id);
    if (!element) return;

    element.textContent = message;
    element.style.color = success ? "#269b70" : "#df6478";
}

function getInitial(name = "Buyer") {
    return name.trim().charAt(0).toUpperCase() || "B";
}

function formatStatus(status) {
    const labels = {
        pending: "Menunggu Penawaran",
        waiting_seller_quote: "Menunggu Penawaran Seller",
        waiting_buyer_approval: "Menunggu Persetujuan Buyer",
        waiting_payment: "Menunggu Pembayaran",
        waiting_verification: "Menunggu Verifikasi",
        confirmed: "Dikonfirmasi",
        in_progress: "Sedang Dikerjakan",
        revision: "Revisi",
        completed: "Selesai",
        cancelled: "Dibatalkan"
    };

    return labels[status] || status;
}

function formatDate(date) {
    if (!date) return "-";

    return new Date(date).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

// =============================================
// DOWNLOAD FINAL ARTWORK
// =============================================

async function downloadFinalArtwork(orderId) {
    const order = buyerOrders.find(item => item.id === orderId);

    if (!order) {
        alert("Data pesanan tidak ditemukan.");
        return;
    }

    if (order.status !== "completed") {
        alert("Pesanan belum selesai.");
        return;
    }

    if (!order.final_file_url) {
        alert("File hasil akhir belum diunggah oleh Seller.");
        return;
    }

    const button = document.querySelector(
        `[data-download-order="${CSS.escape(orderId)}"]`
    );

    const originalText = button?.textContent || "Unduh Hasil Artwork";

    try {
        if (button) {
            button.disabled = true;
            button.textContent = "Menyiapkan file...";
        }

        let fileUrl = order.final_file_url;

        if (!/^https?:\/\//i.test(fileUrl)) {
            const { data } = supabaseClient.storage
                .from("final_deliveries")
                .getPublicUrl(fileUrl);

            fileUrl = data.publicUrl;
        }

        const validUrl = safeImage(fileUrl);

        if (!validUrl) {
            throw new Error("Alamat file hasil akhir tidak valid.");
        }

        const response = await fetch(validUrl);

        if (!response.ok) {
            throw new Error(
                "File tidak dapat diakses. Periksa akses bucket final_deliveries."
            );
        }

        const blob = await response.blob();

        if (!blob.size) {
            throw new Error("File hasil akhir kosong.");
        }

        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        const artwork = artworkData.find(
            item => item.id === order.artwork_id
        );

        const artworkName = artwork?.title || "hasil-artwork";
        const extension = getFileExtension(fileUrl, blob.type);

        link.href = objectUrl;
        link.download = `${artworkName.replace(/[^a-z0-9_-]/gi, "_")}.${extension}`;
        link.style.display = "none";

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);

    } catch (error) {
        console.error("Download final artwork error:", error);

        alert(
            "Gagal mengunduh file: " + error.message +
            "\n\nKamu bisa mencoba membuka file melalui tombol Lihat File."
        );

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

function getFileExtension(url, mimeType = "") {
    try {
        const pathname = new URL(url).pathname;
        const match = pathname.match(/\.([a-zA-Z0-9]+)$/);

        if (match) return match[1].toLowerCase();
    } catch {
        // Gunakan MIME type jika URL tidak dapat dibaca.
    }

    const mimeExtensions = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "application/pdf": "pdf",
        "application/zip": "zip",
        "application/x-photoshop": "psd",
        "application/postscript": "ai"
    };

    return mimeExtensions[mimeType] || "file";
}

// =============================================
// AUTHENTICATION
// =============================================

async function checkBuyerLogin() {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error || !data.user) {
        alert("Silakan login terlebih dahulu.");
        window.location.replace("index.html");
        return false;
    }

    buyerUser = data.user;

    const { data: profile, error: profileError } =
        await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", buyerUser.id)
            .single();

    if (profileError || !profile) {
        alert("Data profil tidak ditemukan.");
        window.location.replace("index.html");
        return false;
    }

    if (profile.role === "seller") {
        window.location.replace("seller.html");
        return false;
    }

    if (profile.role === "admin") {
        window.location.replace("admin.html");
        return false;
    }

    if (profile.role !== "buyer") {
        alert("Akun ini tidak memiliki akses Buyer.");
        window.location.replace("index.html");
        return false;
    }

    buyerProfile = profile;
    return true;
}

// =============================================
// FAVORITES
// =============================================

function loadFavorites() {
    try {
        favoriteIds = JSON.parse(
            localStorage.getItem(`gambarIn_favorites_${buyerUser.id}`)
        ) || [];
    } catch {
        favoriteIds = [];
    }
}

function saveFavorites() {
    localStorage.setItem(
        `gambarIn_favorites_${buyerUser.id}`,
        JSON.stringify(favoriteIds)
    );
}

function toggleFavorite(artworkId) {
    if (favoriteIds.includes(artworkId)) {
        favoriteIds = favoriteIds.filter(id => id !== artworkId);
    } else {
        favoriteIds.push(artworkId);
    }

    saveFavorites();

    renderArtworkCards(artworkData, "dashboardArtwork", 3);
    renderArtworkCards(getFilteredArtworks(), "exploreArtwork");
    renderFavorites();
    updateStatistics();
}

// =============================================
// PROFILE
// =============================================

function setAvatar(element, name, url) {
    if (!element) return;

    const image = safeImage(url);

    element.textContent = image ? "" : getInitial(name);

    element.style.backgroundImage = image
        ? `url("${image}")`
        : "none";

    element.style.backgroundSize = "cover";
    element.style.backgroundPosition = "center";
}

function renderProfile() {
    if (!buyerProfile) return;

    const name = buyerProfile.full_name || "Buyer";

    $("profileName").value = buyerProfile.full_name || "";
    $("profileUsername").value = buyerProfile.username || "";
    $("profileEmail").value = buyerUser.email || "";
    $("profileBio").value = buyerProfile.bio || "";

    setAvatar($("sidebarAvatar"), name, buyerProfile.avatar_url);
    setAvatar($("topbarAvatar"), name, buyerProfile.avatar_url);
    setAvatar($("profileAvatarPreview"), name, buyerProfile.avatar_url);

    $("sidebarName").textContent = name;
    $("topbarName").textContent = name;
}

function setupAvatarPreview() {
    $("profileAvatar").addEventListener("change", event => {
        const file = event.target.files[0];

        if (!file) return;

        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            alert("Gunakan gambar JPG, PNG, atau WEBP.");
            event.target.value = "";
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            alert("Ukuran foto maksimal 2 MB.");
            event.target.value = "";
            return;
        }

        const reader = new FileReader();

        reader.onload = e => {
            const preview = $("profileAvatarPreview");
            preview.textContent = "";
            preview.style.backgroundImage = `url("${e.target.result}")`;
            preview.style.backgroundSize = "cover";
            preview.style.backgroundPosition = "center";
        };

        reader.readAsDataURL(file);
    });
}

async function saveProfile(event) {
    event.preventDefault();

    const button = $("profileForm").querySelector(
        'button[type="submit"]'
    );

    button.disabled = true;
    button.textContent = "Menyimpan...";

    try {
        let avatarUrl = buyerProfile.avatar_url || null;
        const file = $("profileAvatar").files[0];

        if (file) {
            const extension = file.name.split(".").pop();
            const path = `${buyerUser.id}/${Date.now()}.${extension}`;

            const { error: uploadError } =
                await supabaseClient.storage
                    .from("avatars")
                    .upload(path, file, {
                        contentType: file.type,
                        upsert: false
                    });

            if (uploadError) throw uploadError;

            const { data } = supabaseClient.storage
                .from("avatars")
                .getPublicUrl(path);

            avatarUrl = data.publicUrl;
        }

        const updates = {
            full_name: $("profileName").value.trim(),
            username: $("profileUsername").value.trim() || null,
            bio: $("profileBio").value.trim(),
            avatar_url: avatarUrl
        };

        const { data, error } = await supabaseClient
            .from("profiles")
            .update(updates)
            .eq("id", buyerUser.id)
            .select()
            .single();

        if (error) throw error;

        buyerProfile = data;
        renderProfile();

        $("profileAvatar").value = "";

        showMessage("profileMessage", "Profil berhasil diperbarui!");

    } catch (error) {
        console.error(error);

        showMessage(
            "profileMessage",
            error.code === "23505"
                ? "Username sudah digunakan."
                : error.message,
            false
        );

    } finally {
        button.disabled = false;
        button.textContent = "Simpan Perubahan";
    }
}

// =============================================
// NAVIGATION
// =============================================

function openBuyerPage(pageId) {
    document.querySelectorAll(".page-section").forEach(section => {
        section.classList.add("hidden");
        section.classList.remove("active");
    });

    const target = $(pageId);

    if (target) {
        target.classList.remove("hidden");
        target.classList.add("active");
    }

    document.querySelectorAll(".menu-item").forEach(item => {
        item.classList.toggle(
            "active",
            item.dataset.page === pageId
        );
    });

    const headings = {
        dashboard: "Dashboard",
        explore: "Explore Artwork",
        favorites: "Favorite Saya",
        orders: "Pesanan Saya",
        profile: "Profil Saya"
    };

    $("pageHeading").textContent = headings[pageId] || "GambarIn!";

    if (pageId === "dashboard") loadDashboard();

    if (pageId === "explore") {
        renderArtworkCards(getFilteredArtworks(), "exploreArtwork");
    }

    if (pageId === "favorites") renderFavorites();
    if (pageId === "orders") loadBuyerOrders();
    if (pageId === "profile") renderProfile();
}

function setupNavigation() {
    document.querySelectorAll(".menu-item").forEach(button => {
        button.addEventListener("click", () => {
            openBuyerPage(button.dataset.page);
        });
    });

    document.querySelectorAll("[data-go]").forEach(button => {
        button.addEventListener("click", () => {
            openBuyerPage(button.dataset.go);
        });
    });
}

// =============================================
// LOAD ARTWORK
// =============================================

async function loadArtworks() {
    const { data, error } = await supabaseClient
        .from("artworks")
        .select("*")
        .eq("status", "approved")
        .eq("is_archived", false)
        .order("created_at", { ascending: false });

    if (error) throw error;

    artworkData = data || [];
}

function getFilteredArtworks() {
    const search = $("searchArtwork")?.value.toLowerCase().trim() || "";
    const category = $("categoryFilter")?.value || "";
    const sort = $("sortArtwork")?.value || "newest";

    let result = [...artworkData];

    if (search) {
        result = result.filter(item =>
            item.title.toLowerCase().includes(search)
        );
    }

    if (category) {
        result = result.filter(item => item.category === category);
    }

    if (sort === "cheapest") {
        result.sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sort === "expensive") {
        result.sort((a, b) => Number(b.price) - Number(a.price));
    } else {
        result.sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
    }

    return result;
}

// =============================================
// RENDER ARTWORK
// =============================================

function renderArtworkCards(artworks, containerId, limit = null) {
    const container = $(containerId);
    if (!container) return;

    const items = limit ? artworks.slice(0, limit) : artworks;

    if (!items.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Belum ada artwork</h3>
                <p>Artwork yang tersedia akan muncul di sini.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(artwork => {
        const image = safeImage(artwork.image_url);
        const isFavorite = favoriteIds.includes(artwork.id);

        return `
            <article class="artwork-card">
                ${image
                    ? `<img class="artwork-image"
                        src="${escapeHTML(image)}"
                        alt="${escapeHTML(artwork.title)}">`
                    : `<div class="artwork-image"></div>`
                }

                <div class="artwork-info">
                    <h3>${escapeHTML(artwork.title)}</h3>
                    <p>${escapeHTML(artwork.category || "Artwork")}</p>
                    <p class="artwork-price">${rupiah(artwork.price)}</p>

                    <div class="artwork-actions">
                        <button class="detail-button"
                            data-detail="${escapeHTML(artwork.id)}">
                            Detail
                        </button>

                        <button class="favorite-button"
                            data-favorite="${escapeHTML(artwork.id)}">
                            ${isFavorite ? "♥" : "♡"}
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    container.querySelectorAll("[data-detail]").forEach(button => {
        button.addEventListener("click", () => {
            openArtworkDetail(button.dataset.detail);
        });
    });

    container.querySelectorAll("[data-favorite]").forEach(button => {
        button.addEventListener("click", () => {
            toggleFavorite(button.dataset.favorite);
        });
    });
}

function renderFavorites() {
    const favorites = artworkData.filter(item =>
        favoriteIds.includes(item.id)
    );

    renderArtworkCards(favorites, "favoriteArtwork");
}

// =============================================
// ARTWORK DETAIL MODAL
// =============================================

function openArtworkDetail(id) {
    const artwork = artworkData.find(item => item.id === id);

    if (!artwork) return;

    selectedArtwork = artwork;

    const image = safeImage(artwork.image_url);

    $("artworkModalContent").innerHTML = `
        ${image
            ? `<img src="${escapeHTML(image)}"
                alt="${escapeHTML(artwork.title)}"
                style="width:100%;max-height:280px;object-fit:cover;">`
            : ""
        }

        <h2>${escapeHTML(artwork.title)}</h2>
        <p>${escapeHTML(artwork.category || "Artwork")}</p>
        <p>${escapeHTML(artwork.description || "Tidak ada deskripsi.")}</p>
        <h3 style="color:#df7eaa;margin:15px 0;">
            ${rupiah(artwork.price)}
        </h3>

        <button class="primary-button full-button"
            id="detailOrderButton">
            Pesan Artwork
        </button>
    `;

    $("artworkModal").classList.remove("hidden");

    $("detailOrderButton").addEventListener("click", () => {
        closeArtworkModal();
        openOrderModal(artwork.id);
    });
}

function closeArtworkModal() {
    $("artworkModal").classList.add("hidden");
}

// =============================================
// ORDER MODAL
// =============================================

function openOrderModal(artworkId) {
    const artwork = artworkData.find(item => item.id === artworkId);

    if (!artwork) return;

    selectedArtwork = artwork;

    $("orderArtworkInfo").innerHTML = `
        <div style="padding:14px;background:#fff0f6;border-radius:12px;margin:15px 0;">
            <strong>${escapeHTML(artwork.title)}</strong>
            <p>${rupiah(artwork.price)}</p>
        </div>
    `;

    $("orderForm").reset();

    if ($("orderQuantity")) {
        $("orderQuantity").value = 1;
    }

    $("orderMessage").textContent = "";
    $("orderModal").classList.remove("hidden");
}

function closeOrderModal() {
    $("orderModal").classList.add("hidden");
}

// =============================================
// CREATE ORDER - UPDATED
// =============================================

async function createOrder(event) {
    event.preventDefault();

    if (!selectedArtwork) {
        showMessage("orderMessage", "Pilih artwork terlebih dahulu.", false);
        return;
    }

    const size = $("orderSize").value.trim();
    const resolution = $("orderResolution").value;
    const fileFormat = $("orderFileFormat").value;
    const quantity = Number($("orderQuantity").value);
    const whatsapp = $("orderWhatsapp").value.trim();
    const brief = $("orderBrief").value.trim();
    const note = $("orderNote").value.trim();

    if (!size || !resolution || !fileFormat || !brief) {
        showMessage(
            "orderMessage",
            "Lengkapi ukuran, resolusi, format file, dan brief pesanan.",
            false
        );
        return;
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        showMessage(
            "orderMessage",
            "Jumlah pesanan harus antara 1 sampai 100.",
            false
        );
        return;
    }

    const button = $("submitOrderButton");

    button.disabled = true;
    button.textContent = "Mengirim pesanan...";

    try {
        const orderData = {
            buyer_id: buyerUser.id,
            artwork_id: selectedArtwork.id,
            size: size,
            resolution: resolution,
            file_format: fileFormat,
            quantity: quantity,
            whatsapp: whatsapp || null,
            brief: brief,
            note: note,
            status: "pending"
        };

        const { error } = await supabaseClient
            .from("orders")
            .insert(orderData);

        if (error) throw error;

        showMessage("orderMessage", "Pesanan berhasil dibuat!");

        $("orderForm").reset();

        await loadBuyerOrders();
        await loadDashboard();

        setTimeout(closeOrderModal, 1200);

    } catch (error) {
        console.error("Create order error:", error);

        showMessage(
            "orderMessage",
            error.message || "Gagal membuat pesanan.",
            false
        );

    } finally {
        button.disabled = false;
        button.textContent = "Buat Pesanan";
    }
}

// =============================================
// BUYER APPROVE SELLER QUOTE
// =============================================

async function approveSellerQuote(orderId) {
    const order = buyerOrders.find(item => item.id === orderId);

    if (!order || order.status !== "waiting_buyer_approval") {
        alert("Penawaran tidak tersedia atau sudah diproses.");
        return;
    }

    const total = Number(
        order.service_subtotal || order.total_price || 0
    );

    const confirmed = confirm(
        `Setujui penawaran Seller?\n\nTotal pesanan: ${rupiah(total)}\n\nSetelah disetujui, pesanan akan masuk ke tahap pembayaran.`
    );

    if (!confirmed) return;

    const button = document.querySelector(
        `[data-approve-order="${CSS.escape(orderId)}"]`
    );

    if (button) {
        button.disabled = true;
        button.textContent = "Memproses...";
    }

    try {
        const { data, error } = await supabaseClient
            .from("orders")
            .update({ buyer_price_approved: true })
            .eq("id", orderId)
            .eq("buyer_id", buyerUser.id)
            .select("id, status, buyer_price_approved")
            .single();

        if (error) throw error;

        if (!data || data.status !== "waiting_payment") {
            throw new Error("Persetujuan belum terkonfirmasi.");
        }

        alert("Penawaran disetujui! Silakan lanjutkan pembayaran.");

        await loadBuyerOrders();

    } catch (error) {
        console.error(error);
        alert("Gagal menyetujui penawaran: " + error.message);
        await loadBuyerOrders();
    }
}

// =============================================
// PAYMENT MODAL
// =============================================

function ensurePaymentModal() {
    if ($("paymentModal")) return;

    const modal = document.createElement("div");
    modal.id = "paymentModal";
    modal.className = "modal-overlay hidden";

    modal.innerHTML = `
        <div class="modal-box" style="max-width:560px;width:95%;">
            <button type="button" class="modal-close" id="closePaymentModal">×</button>

            <h2>Pembayaran Pesanan</h2>
            <p class="modal-subtitle">Selesaikan pembayaran untuk melanjutkan pesanan.</p>

            <div id="paymentOrderInfo"></div>

            <form id="paymentForm">
                <label for="paymentMethod">Metode Pembayaran</label>
                <select id="paymentMethod" required>
                    <option value="">Pilih metode pembayaran</option>
                    <option value="Transfer Bank">Transfer Bank</option>
                    <option value="E-Wallet">E-Wallet</option>
                </select>

                <div id="paymentAccountInfo"
                    style="margin:14px 0;padding:14px;background:#fff0f6;border-radius:12px;">
                    Pilih metode pembayaran terlebih dahulu.
                </div>

                <label for="paymentProofFile">Upload Bukti Pembayaran</label>
                <input
                    type="file"
                    id="paymentProofFile"
                    accept="image/png,image/jpeg,image/webp"
                    required
                >

                <small style="display:block;margin-top:6px;color:#777;">
                    Format JPG, PNG, atau WEBP. Maksimal 5 MB.
                </small>

                <div id="paymentPreview" style="margin-top:12px;"></div>

                <button type="submit" id="submitPaymentButton"
                    class="primary-button full-button" style="margin-top:18px;">
                    Kirim Bukti Pembayaran
                </button>
            </form>

            <p id="paymentMessage" class="form-message"></p>
        </div>
    `;

    document.body.appendChild(modal);

    $("closePaymentModal").addEventListener("click", closePaymentModal);

    modal.addEventListener("click", event => {
        if (event.target === modal) closePaymentModal();
    });

    $("paymentMethod").addEventListener("change", renderPaymentAccount);
    $("paymentProofFile").addEventListener("change", previewPaymentProof);
    $("paymentForm").addEventListener("submit", submitPayment);
}

function renderPaymentAccount() {
    const method = $("paymentMethod").value;
    const container = $("paymentAccountInfo");

    if (!method) {
        container.innerHTML = "Pilih metode pembayaran terlebih dahulu.";
        return;
    }

    const key = method === "Transfer Bank" ? "bank" : "ewallet";
    const accounts = PAYMENT_ACCOUNTS[key].accounts;

    container.innerHTML = `
        <strong>Informasi ${escapeHTML(method)}</strong>
        ${accounts.map(account => `
            <div style="background:white;padding:12px;border-radius:8px;margin-top:10px;">
                <strong>${escapeHTML(account.bank)}</strong>
                <p style="margin:5px 0;">${escapeHTML(account.number)}</p>
                <small>Atas nama: ${escapeHTML(account.owner)}</small>
            </div>
        `).join("")}
        <small style="display:block;margin-top:10px;color:#777;">
            Informasi di atas merupakan data simulasi untuk demonstrasi UAS.
        </small>
    `;
}

function previewPaymentProof(event) {
    const file = event.target.files?.[0];
    const preview = $("paymentPreview");

    preview.innerHTML = "";

    if (!file) return;

    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(file.type)) {
        alert("Gunakan file JPG, PNG, atau WEBP.");
        event.target.value = "";
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert("Ukuran bukti pembayaran maksimal 5 MB.");
        event.target.value = "";
        return;
    }

    const reader = new FileReader();

    reader.onload = event => {
        preview.innerHTML = `
            <img src="${event.target.result}"
                alt="Preview bukti pembayaran"
                style="width:100%;max-height:220px;object-fit:contain;border-radius:10px;">
        `;
    };

    reader.readAsDataURL(file);
}

function openPaymentModal(orderId) {
    const order = buyerOrders.find(item => item.id === orderId);

    if (!order || order.status !== "waiting_payment") {
        alert("Pesanan ini belum dapat dibayar.");
        return;
    }

    selectedPaymentOrder = order;

    ensurePaymentModal();

    const total = Number(
        order.service_subtotal ?? order.total_price ?? 0
    );

    $("paymentOrderInfo").innerHTML = `
        <div style="padding:14px;background:#fff0f6;border-radius:12px;margin:15px 0;">
            <p>Pesanan #${escapeHTML(String(order.id).slice(0, 8))}</p>
            <h3 style="color:#df7eaa;margin-top:8px;">
                ${rupiah(total)}
            </h3>
        </div>
    `;

    $("paymentForm").reset();
    $("paymentPreview").innerHTML = "";
    $("paymentMessage").textContent = "";
    $("paymentAccountInfo").innerHTML =
        "Pilih metode pembayaran terlebih dahulu.";

    $("paymentModal").classList.remove("hidden");
}

function closePaymentModal() {
    $("paymentModal")?.classList.add("hidden");
    selectedPaymentOrder = null;
}

// =============================================
// SUBMIT PAYMENT
// =============================================

async function submitPayment(event) {
    event.preventDefault();

    const order = selectedPaymentOrder;

    if (!order) return;

    const method = $("paymentMethod").value;
    const file = $("paymentProofFile").files?.[0];
    const button = $("submitPaymentButton");

    if (!method || !file) {
        showMessage("paymentMessage", "Lengkapi metode dan bukti pembayaran.", false);
        return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        showMessage("paymentMessage", "Format file tidak didukung.", false);
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showMessage("paymentMessage", "Ukuran file maksimal 5 MB.", false);
        return;
    }

    button.disabled = true;
    button.textContent = "Mengunggah...";

    try {
        const extension = file.type === "image/png"
            ? "png"
            : file.type === "image/webp"
                ? "webp"
                : "jpg";

        const filePath =
            `${buyerUser.id}/${order.id}/${Date.now()}.${extension}`;

        const { error: uploadError } = await supabaseClient.storage
            .from("payment_proofs")
            .upload(filePath, file, {
                contentType: file.type,
                upsert: false
            });

        if (uploadError) throw uploadError;

        button.textContent = "Mengirim pembayaran...";

        const { data, error } = await supabaseClient
            .from("orders")
            .update({
                payment_method: method,
                payment_proof: filePath,
                payment_status: "awaiting_verification"
            })
            .eq("id", order.id)
            .eq("buyer_id", buyerUser.id)
            .select("id, status, payment_status")
            .single();

        if (error) throw error;

        if (!data || data.status !== "waiting_verification") {
            throw new Error(
                "Pembayaran belum tercatat sebagai menunggu verifikasi."
            );
        }

        alert("Bukti pembayaran berhasil dikirim! Tunggu verifikasi Admin.");

        closePaymentModal();
        await loadBuyerOrders();

    } catch (error) {
        console.error("Payment error:", error);

        showMessage(
            "paymentMessage",
            error.message || "Gagal mengirim pembayaran.",
            false
        );

    } finally {
        button.disabled = false;
        button.textContent = "Kirim Bukti Pembayaran";
    }
}

// =============================================
// ORDER DETAILS
// =============================================

function renderOrderSpecifications(order) {
    const details = [
        ["Ukuran", order.size],
        ["Resolusi", order.resolution],
        ["Format File", order.file_format],
        ["Jumlah", order.quantity ? `${order.quantity} karya` : null],
        ["WhatsApp", order.whatsapp],
        ["Brief", order.brief],
        ["Catatan Tambahan", order.note]
    ];

    const availableDetails = details.filter(
        ([, value]) => value !== null && value !== undefined && value !== ""
    );

    if (!availableDetails.length) return "";

    return `
        <div style="margin-top:14px;padding:14px;background:#fff8fb;border:1px solid #f5dce8;border-radius:12px;">
            <h4 style="margin-bottom:10px;">Spesifikasi Pesanan</h4>

            ${availableDetails.map(([label, value]) => `
                <div style="margin-bottom:9px;">
                    <small style="display:block;color:#888;">
                        ${escapeHTML(label)}
                    </small>
                    <p style="margin:3px 0;white-space:pre-wrap;overflow-wrap:anywhere;">
                        ${escapeHTML(value)}
                    </p>
                </div>
            `).join("")}
        </div>
    `;
}

// =============================================
// ORDERS
// =============================================

async function loadBuyerOrders() {
    const container = $("orderList");

    if (!container) return;

    container.innerHTML = `<p>Memuat pesanan...</p>`;

    try {
        const { data, error } = await supabaseClient
            .from("orders")
            .select("*")
            .eq("buyer_id", buyerUser.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        buyerOrders = data || [];

        renderBuyerOrders();
        updateStatistics();

    } catch (error) {
        console.error(error);
        container.textContent = "Gagal memuat pesanan: " + error.message;
    }
}

function renderBuyerOrders() {
    const container = $("orderList");

    if (!container) return;

    const filter = $("orderFilter")?.value || "";

    const filtered = buyerOrders.filter(order =>
        !filter || order.status === filter
    );

    if (!filtered.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Belum ada pesanan</h3>
                <p>Pesanan yang kamu buat akan muncul di sini.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(order => {
        const artwork = artworkData.find(
            item => item.id === order.artwork_id
        );

        const title = artwork?.title || "Artwork";

        const showApproval =
            order.status === "waiting_buyer_approval";

        const showPayment =
            order.status === "waiting_payment";

        const basePrice = Number(order.base_price || 0);
        const additionalFee = Number(order.additional_fee || 0);

        const subtotal = Number(
            order.service_subtotal ??
            order.total_price ??
            (basePrice + additionalFee)
        );

        const fileUrl = order.final_file_url
            ? (
                /^https?:\/\//i.test(order.final_file_url)
                    ? order.final_file_url
                    : supabaseClient.storage
                        .from("final_deliveries")
                        .getPublicUrl(order.final_file_url).data.publicUrl
            )
            : "";

        return `
            <div class="order-card">
                <div class="order-card-content">
                    <h3>${escapeHTML(title)}</h3>

                    <p>
                        Order #${escapeHTML(String(order.id).slice(0, 8))}
                    </p>

                    <p>${formatDate(order.created_at)}</p>

                    ${renderOrderSpecifications(order)}

                    ${
                        showApproval
                        ? `
                            <div class="quote-detail"
                                style="background:#fff0f6;padding:16px;border-radius:12px;margin-top:15px;">

                                <h4>Rincian Penawaran Seller</h4>

                                <p>Harga dasar: <strong>${rupiah(basePrice)}</strong></p>
                                <p>Biaya tambahan: <strong>${rupiah(additionalFee)}</strong></p>

                                <div style="margin:12px 0;padding:10px;background:white;border-radius:8px;">
                                    <small>Catatan Seller</small>
                                    <p>${escapeHTML(
                                        order.additional_fee_note ||
                                        order.seller_quote_note ||
                                        "Tidak ada catatan."
                                    )}</p>
                                </div>

                                <hr style="margin:12px 0;">

                                <p>Subtotal: <strong>${rupiah(subtotal)}</strong></p>

                                <h3 style="color:#df7eaa;margin:14px 0;">
                                    Total Pembayaran: ${rupiah(subtotal)}
                                </h3>

                                <button
                                    class="primary-button"
                                    data-approve-order="${escapeHTML(order.id)}"
                                    style="margin-top:10px;width:100%;">
                                    Setujui Penawaran
                                </button>
                            </div>
                        `
                        : ""
                    }

                    ${
                        showPayment
                        ? `
                            <div style="margin-top:14px;padding:15px;background:#fff0f6;border-radius:12px;">
                                <h4>Tagihan Pembayaran</h4>
                                <h3 style="color:#df7eaa;margin:8px 0;">
                                    ${rupiah(subtotal)}
                                </h3>
                                <button
                                    class="primary-button"
                                    data-pay-order="${escapeHTML(order.id)}"
                                    style="width:100%;margin-top:8px;">
                                    Bayar Sekarang
                                </button>
                            </div>
                        `
                        : ""
                    }

                    ${
                        order.status === "waiting_verification"
                        ? `
                            <p style="margin-top:12px;color:#a66b27;">
                                Bukti pembayaran telah dikirim. Menunggu pemeriksaan Admin.
                            </p>
                        `
                        : ""
                    }

                    ${
                        order.status === "completed"
                        ? `
                            <div style="margin-top:15px;padding:16px;background:#eaf8f1;border-radius:12px;">
                                <h4 style="color:#168653;margin-bottom:8px;">
                                    ✓ Pesanan Selesai!
                                </h4>

                                <p style="margin-bottom:12px;">
                                    Seller telah menyelesaikan artwork kamu.
                                    File hasil akhir sudah tersedia untuk diunduh.
                                </p>

                                ${
                                    fileUrl
                                    ? `
                                        <button
                                            type="button"
                                            class="primary-button"
                                            data-download-order="${escapeHTML(order.id)}"
                                            style="width:100%;margin-bottom:8px;">
                                            ↓ Unduh Hasil Artwork
                                        </button>

                                        <a
                                            href="${escapeHTML(safeImage(fileUrl))}"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style="display:block;text-align:center;padding:10px;color:#168653;">
                                            Lihat File Hasil Akhir
                                        </a>
                                    `
                                    : `
                                        <p style="color:#b4771c;">
                                            File hasil akhir belum tersedia. Silakan hubungi Seller.
                                        </p>
                                    `
                                }
                            </div>
                        `
                        : ""
                    }

                    ${
                        order.status !== "completed" &&
                        !showApproval &&
                        !showPayment
                        ? `<p style="margin-top:8px;">Total: ${rupiah(
                            order.total_price ||
                            order.service_subtotal ||
                            order.base_price
                        )}</p>`
                        : ""
                    }
                </div>

                <span class="order-status ${escapeHTML(order.status)}">
                    ${escapeHTML(formatStatus(order.status))}
                </span>
            </div>
        `;
    }).join("");

    container.querySelectorAll("[data-approve-order]").forEach(button => {
        button.addEventListener("click", () => {
            approveSellerQuote(button.dataset.approveOrder);
        });
    });

    container.querySelectorAll("[data-pay-order]").forEach(button => {
        button.addEventListener("click", () => {
            openPaymentModal(button.dataset.payOrder);
        });
    });

    container.querySelectorAll("[data-download-order]").forEach(button => {
        button.addEventListener("click", () => {
            downloadFinalArtwork(button.dataset.downloadOrder);
        });
    });
}

// =============================================
// DASHBOARD STATISTICS
// =============================================

function updateStatistics() {
    if ($("totalFavorites")) {
        $("totalFavorites").textContent = favoriteIds.length;
    }

    if ($("totalOrders")) {
        $("totalOrders").textContent = buyerOrders.length;
    }

    if ($("pendingOrders")) {
        $("pendingOrders").textContent =
            buyerOrders.filter(order =>
                [
                    "pending",
                    "waiting_seller_quote",
                    "waiting_buyer_approval",
                    "waiting_payment",
                    "waiting_verification"
                ].includes(order.status)
            ).length;
    }

    if ($("completedOrders")) {
        $("completedOrders").textContent =
            buyerOrders.filter(order => order.status === "completed").length;
    }
}

async function loadDashboard() {
    renderArtworkCards(artworkData, "dashboardArtwork", 3);

    const recentOrders = buyerOrders.slice(0, 3);
    const container = $("dashboardOrders");

    if (!container) return;

    if (!recentOrders.length) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Kamu belum memiliki pesanan.</p>
            </div>
        `;
    } else {
        container.innerHTML = recentOrders.map(order => {
            const artwork = artworkData.find(
                item => item.id === order.artwork_id
            );

            return `
                <div class="order-card">
                    <div>
                        <h3>${escapeHTML(artwork?.title || "Artwork")}</h3>
                        <p>${rupiah(
                            order.total_price ||
                            order.service_subtotal ||
                            order.base_price
                        )}</p>
                        <p>${escapeHTML(formatStatus(order.status))}</p>
                    </div>
                </div>
            `;
        }).join("");
    }

    updateStatistics();
}

// =============================================
// SEARCH & FILTER
// =============================================

function setupFilters() {
    $("searchArtwork").addEventListener("input", () => {
        renderArtworkCards(getFilteredArtworks(), "exploreArtwork");
    });

    $("categoryFilter").addEventListener("change", () => {
        renderArtworkCards(getFilteredArtworks(), "exploreArtwork");
    });

    $("sortArtwork").addEventListener("change", () => {
        renderArtworkCards(getFilteredArtworks(), "exploreArtwork");
    });

    $("orderFilter").addEventListener("change", renderBuyerOrders);
}

// =============================================
// MODAL EVENTS
// =============================================

function setupModals() {
    $("closeArtworkModal").addEventListener("click", closeArtworkModal);
    $("closeOrderModal").addEventListener("click", closeOrderModal);

    $("artworkModal").addEventListener("click", event => {
        if (event.target === $("artworkModal")) {
            closeArtworkModal();
        }
    });

    $("orderModal").addEventListener("click", event => {
        if (event.target === $("orderModal")) {
            closeOrderModal();
        }
    });
}

// =============================================
// LOGOUT
// =============================================

async function logoutBuyer() {
    if (!confirm("Yakin ingin logout?")) return;

    const button = $("logoutButton");
    button.disabled = true;
    button.textContent = "Logging out...";

    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        alert("Gagal logout: " + error.message);
        button.disabled = false;
        button.innerHTML = "<span>↪</span> Logout";
        return;
    }

    window.location.replace("index.html");
}

// =============================================
// INITIALIZATION
// =============================================

async function initBuyerDashboard() {
    try {
        const allowed = await checkBuyerLogin();

        if (!allowed) return;

        loadFavorites();
        renderProfile();

        setupNavigation();
        setupAvatarPreview();
        setupFilters();
        setupModals();

        $("profileForm").addEventListener("submit", saveProfile);
        $("orderForm").addEventListener("submit", createOrder);
        $("logoutButton").addEventListener("click", logoutBuyer);

        await loadArtworks();
        await loadBuyerOrders();

        openBuyerPage("dashboard");

    } catch (error) {
        console.error("Buyer dashboard error:", error);

        const message = $("globalMessage");

        if (message) {
            message.textContent =
                "Gagal membuka dashboard: " + error.message;
        }
    }
}

document.addEventListener("DOMContentLoaded", initBuyerDashboard);
