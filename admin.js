/* =========================================================
   GAMBARIN! - ADMIN DASHBOARD
   Alur harga & pembayaran:
   - Seller menentukan biaya tambahan (penawaran).
   - Buyer menyetujui subtotal dan melakukan pembayaran.
   - Admin memverifikasi/menolak pembayaran (bukan menentukan harga).
   - Komisi platform 10% dipotong dari pendapatan Seller.
========================================================= */

const ORDER_STATUS_LABELS = {
    waiting_seller_quote: "Menunggu Penawaran Seller",
    waiting_buyer_approval: "Menunggu Persetujuan Buyer",
    waiting_payment: "Menunggu Pembayaran",
    waiting_verification: "Menunggu Verifikasi Pembayaran",
    confirmed: "Pembayaran Terverifikasi",
    in_progress: "Sedang Dikerjakan",
    revision: "Revisi",
    completed: "Selesai",
    cancelled: "Dibatalkan"
};

const ARTWORK_STATUS_LABELS = {
    pending: "Menunggu Review",
    approved: "Disetujui",
    rejected: "Ditolak"
};

const PAYMENT_STATUS_LABELS = {
    unpaid: "Belum Dibayar",
    awaiting_payment: "Menunggu Pembayaran",
    awaiting_verification: "Menunggu Verifikasi",
    paid: "Terverifikasi",
    rejected: "Ditolak"
};

let adminUser = null;
let adminProfile = null;

let adminArtworks = [];
let adminUsers = [];
let adminOrders = [];

let selectedArtworkId = null;
let selectedOrderId = null;

/* =========================================================
   HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);

function formatRupiah(value) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatJoinDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function getInitial(name = "A") {
    const text = String(name || "").trim();
    return (text.charAt(0) || "A").toUpperCase();
}

function showMessage(message, isError = false) {
    const element = $("globalMessage");
    if (!element) return;

    element.textContent = message;
    element.classList.remove("hidden", "error");
    if (isError) element.classList.add("error");

    window.scrollTo({ top: 0, behavior: "smooth" });
    window.clearTimeout(showMessage._timer);
    showMessage._timer = window.setTimeout(() => {
        element.classList.add("hidden");
    }, 4500);
}

function setButtonLoading(button, loading, originalText = "Simpan") {
    if (!button) return;
    button.disabled = loading;
    button.textContent = loading ? "Memproses..." : originalText;
}

function statusBadge(status, labels = ORDER_STATUS_LABELS) {
    const label = labels[status] || PAYMENT_STATUS_LABELS[status] || status || "Tidak diketahui";

    let className = "status-pending";
    if (["approved", "completed", "confirmed", "paid"].includes(status)) {
        className = "status-approved";
    } else if (["rejected", "cancelled"].includes(status)) {
        className = "status-rejected";
    } else if (["in_progress", "revision", "waiting_payment", "awaiting_verification"].includes(status)) {
        className = "status-confirmed";
    }

    return `<span class="status-badge ${className}">${escapeHTML(label)}</span>`;
}

function roleLabel(role) {
    const labels = { buyer: "Buyer", seller: "Seller", admin: "Admin" };
    return labels[role] || role || "-";
}

function getOrderTotal(order) {
    const subtotal = Number(order?.service_subtotal);
    if (Number.isFinite(subtotal) && subtotal > 0) return subtotal;
    const total = Number(order?.total_price);
    if (Number.isFinite(total) && total > 0) return total;
    const base = Number(order?.base_price || 0);
    const add = Number(order?.additional_fee || 0);
    return base + add;
}

function getPricing(order) {
    const basePrice = Number(order?.base_price || 0);
    const additionalFee = Number(order?.additional_fee || 0);
    const subtotal = getOrderTotal(order);
    const commissionRate = Number(order?.platform_fee_rate ?? 10);
    const commission = Number.isFinite(Number(order?.platform_fee_amount))
        ? Number(order.platform_fee_amount)
        : (subtotal * commissionRate) / 100;
    const sellerEarning = Number.isFinite(Number(order?.seller_earning))
        ? Number(order.seller_earning)
        : subtotal - commission;

    return { basePrice, additionalFee, subtotal, commissionRate, commission, sellerEarning };
}

function matchesKeyword(values, keyword) {
    if (!keyword) return true;
    return values.some((value) => String(value || "").toLowerCase().includes(keyword));
}

function setAvatar(element, name, avatarUrl) {
    if (!element) return;
    if (avatarUrl) {
        element.style.backgroundImage = `url("${avatarUrl}")`;
        element.style.backgroundSize = "cover";
        element.style.backgroundPosition = "center";
        element.textContent = "";
    } else {
        element.style.backgroundImage = "";
        element.textContent = getInitial(name);
    }
}

/* =========================================================
   AUTHENTICATION & PROFILE
========================================================= */

async function checkAdminAccess() {
    const { data: { user }, error } = await supabaseClient.auth.getUser();

    if (error || !user) {
        window.location.href = "index.html";
        return false;
    }

    const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

    if (profileError || !profile || profile.role !== "admin") {
        alert("Akses hanya untuk Admin.");
        window.location.href = "index.html";
        return false;
    }

    adminUser = user;
    adminProfile = profile;
    return true;
}

function renderAdminProfile() {
    if (!adminProfile || !adminUser) return;

    const name = adminProfile.full_name || adminProfile.username || "Administrator";
    const avatar = adminProfile.avatar_url || "";

    if ($("sidebarName")) $("sidebarName").textContent = name;
    if ($("topbarName")) $("topbarName").textContent = name;
    if ($("welcomeAdmin")) $("welcomeAdmin").textContent = name;

    setAvatar($("sidebarAvatar"), name, avatar);
    setAvatar($("topbarAvatar"), name, avatar);
    setAvatar($("profileAvatar"), name, avatar);

    if ($("adminFullName")) $("adminFullName").value = adminProfile.full_name || "";
    if ($("adminUsername")) $("adminUsername").value = adminProfile.username || "";
    if ($("adminEmail")) $("adminEmail").value = adminUser.email || "";
    if ($("adminBio")) $("adminBio").value = adminProfile.bio || "";
}

async function saveAdminProfile(event) {
    event.preventDefault();
    const button = $("adminProfileForm")?.querySelector('button[type="submit"]');
    setButtonLoading(button, true, "Simpan Perubahan");

    try {
        const updates = {
            full_name: $("adminFullName")?.value.trim() || null,
            username: $("adminUsername")?.value.trim() || null,
            bio: $("adminBio")?.value.trim() || null
        };

        const { error } = await supabaseClient
            .from("profiles")
            .update(updates)
            .eq("id", adminUser.id);

        if (error) throw error;

        adminProfile = { ...adminProfile, ...updates };
        renderAdminProfile();
        const msg = $("profileMessage");
        if (msg) {
            msg.textContent = "Profil Admin berhasil diperbarui.";
            msg.classList.remove("hidden");
        }
        showMessage("Profil Admin berhasil diperbarui.");
    } catch (error) {
        console.error(error);
        const msg = $("profileMessage");
        if (msg) {
            msg.textContent = error.message || "Gagal memperbarui profil.";
            msg.classList.remove("hidden");
        }
        showMessage(error.message || "Gagal memperbarui profil.", true);
    } finally {
        setButtonLoading(button, false, "Simpan Perubahan");
    }
}

/* =========================================================
   NAVIGATION
========================================================= */

function setActivePage(page) {
    document.querySelectorAll(".menu-item[data-page]").forEach((item) => {
        item.classList.toggle("active", item.dataset.page === page);
    });

    document.querySelectorAll(".page-section").forEach((section) => {
        section.classList.toggle("hidden", section.id !== `page-${page}`);
    });

    const heading = {
        dashboard: "Dashboard",
        artworks: "Kelola Artwork",
        users: "Kelola Pengguna",
        orders: "Kelola Pesanan",
        profile: "Profil Admin"
    };

    if ($("pageHeading")) $("pageHeading").textContent = heading[page] || "Dashboard";
}

function initAdminNavigation() {
    document.querySelectorAll(".menu-item[data-page]").forEach((button) => {
        button.addEventListener("click", () => setActivePage(button.dataset.page));
    });

    document.querySelectorAll("[data-go]").forEach((button) => {
        button.addEventListener("click", () => setActivePage(button.dataset.go));
    });
}

/* =========================================================
   LOAD DATA
========================================================= */

async function loadAdminData() {
    const [artworksResult, usersResult, ordersResult] = await Promise.allSettled([
        loadAdminArtworks(),
        loadAdminUsers(),
        loadAdminOrders()
    ]);

    if (artworksResult.status === "rejected") {
        console.error("Load artworks error:", artworksResult.reason);
        const list = $("adminArtworkList");
        if (list) list.innerHTML = `<p class="empty-state">Gagal memuat artwork: ${escapeHTML(artworksResult.reason?.message || "Terjadi kesalahan.")}</p>`;
        const pending = $("dashboardPending");
        if (pending) pending.innerHTML = `<p class="empty-state">Gagal memuat artwork.</p>`;
    }

    if (usersResult.status === "rejected") {
        console.error("Load users error:", usersResult.reason);
        adminUsers = [];
        const tbody = $("adminUserList");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="4">Gagal memuat pengguna: ${escapeHTML(usersResult.reason?.message || "Terjadi kesalahan.")}</td></tr>`;
        }
    }

    if (ordersResult.status === "rejected") {
        console.error("Load orders error:", ordersResult.reason);
        adminOrders = [];
        const ordersBody = $("adminOrderList");
        if (ordersBody) {
            ordersBody.innerHTML = `<tr><td colspan="6">Gagal memuat pesanan: ${escapeHTML(ordersResult.reason?.message || "Terjadi kesalahan.")}</td></tr>`;
        }
        const dashOrders = $("dashboardOrders");
        if (dashOrders) {
            dashOrders.innerHTML = `<tr><td colspan="5">Gagal memuat pesanan.</td></tr>`;
        }
    }

    renderAdminDashboard();
}

/* =========================================================
   ARTWORK MANAGEMENT
========================================================= */

async function loadAdminArtworks() {
    const { data, error } = await supabaseClient
        .from("artworks")
        .select(`
            *,
            seller:profiles!artworks_seller_id_fkey (
                id,
                full_name,
                username,
                store_name
            )
        `)
        .order("created_at", { ascending: false });

    if (error) throw error;

    adminArtworks = data || [];
    renderAdminArtworks();
    renderDashboardPending();
}

function renderAdminArtworks() {
    const container = $("adminArtworkList");
    if (!container) return;

    const keyword = ($("searchArtwork")?.value || "").toLowerCase().trim();
    const filter = $("artworkStatusFilter")?.value || "all";

    const filtered = adminArtworks.filter((artwork) => {
        const sellerName = artwork.seller?.store_name || artwork.seller?.full_name || artwork.seller?.username || "";
        const keywordMatch = matchesKeyword([artwork.title, sellerName, artwork.seller?.username], keyword);
        const statusMatch = filter === "all" || artwork.status === filter;
        return keywordMatch && statusMatch;
    });

    if (!filtered.length) {
        container.innerHTML = `<p class="empty-state">Tidak ada artwork yang ditemukan.</p>`;
        return;
    }

    container.innerHTML = filtered.map((artwork) => {
        const sellerName = artwork.seller?.store_name || artwork.seller?.full_name || artwork.seller?.username || "-";
        const canModerate = artwork.status === "pending";

        return `
            <article class="artwork-card">
                <img
                    class="artwork-image"
                    src="${escapeHTML(artwork.image_url || "")}"
                    alt="${escapeHTML(artwork.title || "Artwork")}"
                    onerror="this.style.display='none'"
                >
                <div class="artwork-info">
                    <h4>${escapeHTML(artwork.title || "-")}</h4>
                    <p>Seller: ${escapeHTML(sellerName)}</p>
                    <p>${escapeHTML(artwork.category || "-")}</p>
                    <div class="artwork-meta">
                        <strong>${formatRupiah(artwork.price)}</strong>
                        ${statusBadge(artwork.status, ARTWORK_STATUS_LABELS)}
                    </div>
                    <div class="artwork-actions">
                        <button type="button" class="primary-button" onclick="openArtworkDetail('${artwork.id}')">Detail</button>
                        ${canModerate ? `<button type="button" class="approve-button" onclick="approveArtwork('${artwork.id}')">Setujui</button>` : ""}
                        ${canModerate ? `<button type="button" class="reject-button" onclick="openRejectModal('${artwork.id}')">Tolak</button>` : ""}
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

function openArtworkDetail(id) {
    const artwork = adminArtworks.find((item) => item.id === id);
    if (!artwork) return;

    selectedArtworkId = id;
    const sellerName = artwork.seller?.store_name || artwork.seller?.full_name || artwork.seller?.username || "-";

    const content = $("artworkModalContent");
    if (!content) return;

    content.innerHTML = `
        <h3>${escapeHTML(artwork.title || "-")}</h3>
        ${artwork.image_url ? `<img src="${escapeHTML(artwork.image_url)}" alt="${escapeHTML(artwork.title || "Artwork")}">` : ""}
        <p><strong>Seller:</strong> ${escapeHTML(sellerName)}</p>
        <p><strong>Kategori:</strong> ${escapeHTML(artwork.category || "-")}</p>
        <p><strong>Harga dasar:</strong> ${formatRupiah(artwork.price)}</p>
        <p><strong>Status:</strong> ${statusBadge(artwork.status, ARTWORK_STATUS_LABELS)}</p>
        <p><strong>Deskripsi:</strong><br>${escapeHTML(artwork.description || "-")}</p>
        ${artwork.rejection_reason ? `<p><strong>Alasan penolakan:</strong><br>${escapeHTML(artwork.rejection_reason)}</p>` : ""}
    `;

    $("artworkModal")?.classList.remove("hidden");
}

async function approveArtwork(id) {
    if (!confirm("Setujui artwork ini agar dapat dilihat Buyer?")) return;

    try {
        const { error } = await supabaseClient
            .from("artworks")
            .update({ status: "approved", rejection_reason: null })
            .eq("id", id);

        if (error) throw error;

        await loadAdminArtworks();
        renderAdminDashboard();
        showMessage("Artwork berhasil disetujui.");
    } catch (error) {
        console.error(error);
        showMessage(error.message || "Gagal menyetujui artwork.", true);
    }
}

function openRejectModal(id) {
    selectedArtworkId = id;
    if ($("rejectionReason")) $("rejectionReason").value = "";
    const msg = $("rejectMessage");
    if (msg) {
        msg.textContent = "";
        msg.classList.add("hidden");
    }
    $("rejectModal")?.classList.remove("hidden");
}

async function rejectArtwork() {
    if (!selectedArtworkId) return;

    const reason = $("rejectionReason")?.value.trim();
    const msg = $("rejectMessage");

    if (!reason) {
        if (msg) {
            msg.textContent = "Alasan penolakan wajib diisi.";
            msg.classList.remove("hidden");
        }
        return;
    }

    const button = $("confirmRejectButton");
    setButtonLoading(button, true, "Tolak Artwork");

    try {
        const { error } = await supabaseClient
            .from("artworks")
            .update({ status: "rejected", rejection_reason: reason })
            .eq("id", selectedArtworkId);

        if (error) throw error;

        $("rejectModal")?.classList.add("hidden");
        await loadAdminArtworks();
        renderAdminDashboard();
        showMessage("Artwork berhasil ditolak.");
    } catch (error) {
        console.error(error);
        if (msg) {
            msg.textContent = error.message || "Gagal menolak artwork.";
            msg.classList.remove("hidden");
        }
    } finally {
        setButtonLoading(button, false, "Tolak Artwork");
    }
}

function renderDashboardPending() {
    const container = $("dashboardPending");
    if (!container) return;

    const pending = adminArtworks.filter((item) => item.status === "pending");
    if ($("pendingBadge")) $("pendingBadge").textContent = String(pending.length);

    const latest = pending.slice(0, 5);
    if (!latest.length) {
        container.innerHTML = `<p class="empty-state">Tidak ada artwork yang menunggu moderasi.</p>`;
        return;
    }

    container.innerHTML = latest.map((item) => `
        <div class="table-user">
            <div class="table-avatar">${getInitial(item.title || "A")}</div>
            <div>
                <strong>${escapeHTML(item.title || "-")}</strong>
                <small>${escapeHTML(item.seller?.store_name || item.seller?.full_name || "-")} · ${formatRupiah(item.price)}</small>
            </div>
            <button type="button" class="text-button" onclick="openArtworkDetail('${item.id}')">Lihat</button>
        </div>
    `).join("");
}

/* =========================================================
   USER MANAGEMENT
========================================================= */

async function loadAdminUsers() {
    const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) throw error;

    adminUsers = Array.isArray(data) ? data : [];
    console.info(`[Admin] profiles loaded: ${adminUsers.length}`);
    renderAdminUsers();
}

function renderAdminUsers() {
    const container = $("adminUserList");
    if (!container) return;

    const keyword = ($("searchUser")?.value || "").toLowerCase().trim();
    const roleFilter = $("userRoleFilter")?.value || "all";

    const filtered = adminUsers.filter((user) => {
        const keywordMatch = matchesKeyword(
            [user.full_name, user.username, user.store_name, user.role, user.email],
            keyword
        );
        const roleMatch = roleFilter === "all" || user.role === roleFilter;
        return keywordMatch && roleMatch;
    });

    if (!filtered.length) {
        const hasData = adminUsers.length > 0;
        const message = hasData
            ? "Tidak ada pengguna yang cocok dengan pencarian/filter."
            : "Belum ada data pengguna yang dapat ditampilkan. Jika data seharusnya ada, periksa izin akses (Row Level Security) tabel profiles di Supabase agar Admin dapat membaca semua pengguna.";
        container.innerHTML = `<tr><td colspan="4">${escapeHTML(message)}</td></tr>`;
        return;
    }

    container.innerHTML = filtered.map((user) => {
        const displayName = user.full_name || user.store_name || user.username || "-";
        return `
            <tr>
                <td>
                    <div class="table-user">
                        <div class="table-avatar">${getInitial(displayName)}</div>
                        <strong>${escapeHTML(displayName)}</strong>
                    </div>
                </td>
                <td>${escapeHTML(user.username || "-")}</td>
                <td><span class="role-badge">${escapeHTML(roleLabel(user.role))}</span></td>
                <td>${escapeHTML(formatJoinDate(user.created_at))}</td>
            </tr>
        `;
    }).join("");
}

/* =========================================================
   ORDER MANAGEMENT
========================================================= */

async function loadAdminOrders() {
    const { data, error } = await supabaseClient
        .from("orders")
        .select(`
            *,
            artwork:artworks (
                id,
                title,
                image_url
            ),
            buyer:profiles!orders_buyer_id_fkey (
                id,
                full_name,
                username
            ),
            seller:profiles!orders_seller_id_fkey (
                id,
                full_name,
                username,
                store_name
            )
        `)
        .order("created_at", { ascending: false });

    if (error) throw error;

    adminOrders = data || [];
    renderAdminOrders();
    renderDashboardOrders();
}

function renderAdminOrders() {
    const container = $("adminOrderList");
    if (!container) return;

    const keyword = ($("searchOrder")?.value || "").toLowerCase().trim();
    const filter = $("orderStatusFilter")?.value || "all";

    const filtered = adminOrders.filter((order) => {
        const keywordMatch = matchesKeyword(
            [
                order.id,
                order.artwork?.title,
                order.buyer?.full_name,
                order.buyer?.username,
                order.seller?.full_name,
                order.seller?.store_name,
                order.seller?.username
            ],
            keyword
        );
        const statusMatch = filter === "all" || order.status === filter;
        return keywordMatch && statusMatch;
    });

    if (!filtered.length) {
        container.innerHTML = `<tr><td colspan="6">Belum ada pesanan yang sesuai.</td></tr>`;
        return;
    }

    container.innerHTML = filtered.map((order) => {
        const artworkTitle = order.artwork?.title || "Pesanan";
        const buyerName = order.buyer?.full_name || order.buyer?.username || "-";
        const sellerName = order.seller?.store_name || order.seller?.full_name || order.seller?.username || "-";

        return `
            <tr>
                <td>
                    <strong>${escapeHTML(artworkTitle)}</strong><br>
                    <button type="button" class="text-button" onclick="openOrderDetail('${order.id}')">Lihat detail</button>
                </td>
                <td>${escapeHTML(buyerName)}</td>
                <td>${escapeHTML(sellerName)}</td>
                <td>${formatRupiah(getOrderTotal(order))}</td>
                <td>${statusBadge(order.status)}</td>
                <td>${escapeHTML(formatDateTime(order.created_at))}</td>
            </tr>
        `;
    }).join("");
}

function renderDashboardOrders() {
    const container = $("dashboardOrders");
    if (!container) return;

    const latest = adminOrders.slice(0, 5);
    if (!latest.length) {
        container.innerHTML = `<tr><td colspan="5">Belum ada pesanan.</td></tr>`;
        return;
    }

    container.innerHTML = latest.map((order) => {
        const artworkTitle = order.artwork?.title || "Pesanan";
        const buyerName = order.buyer?.full_name || order.buyer?.username || "-";
        const sellerName = order.seller?.store_name || order.seller?.full_name || order.seller?.username || "-";

        return `
            <tr>
                <td>
                    <button type="button" class="text-button" onclick="openOrderDetail('${order.id}')">${escapeHTML(artworkTitle)}</button>
                </td>
                <td>${escapeHTML(buyerName)}</td>
                <td>${escapeHTML(sellerName)}</td>
                <td>${formatRupiah(getOrderTotal(order))}</td>
                <td>${statusBadge(order.status)}</td>
            </tr>
        `;
    }).join("");
}

function renderOrderDetail(order) {
    const content = $("orderModalContent");
    if (!content) return;

    const pricing = getPricing(order);
    const buyerName = order.buyer?.full_name || order.buyer?.username || "-";
    const sellerName = order.seller?.store_name || order.seller?.full_name || order.seller?.username || "-";
    const artworkTitle = order.artwork?.title || "-";
    const briefText = order.brief || order.note || "-";
    const extraNote = order.note && order.brief && order.note !== order.brief ? order.note : "-";

    const proofHTML = order.payment_proof
        ? `<p><strong>Bukti pembayaran:</strong><br><a href="${escapeHTML(order.payment_proof)}" target="_blank" rel="noopener">Lihat bukti pembayaran</a></p>`
        : `<p><strong>Bukti pembayaran:</strong> Belum diunggah</p>`;

    const finalHTML = order.final_file_url
        ? `<p><strong>File hasil akhir:</strong><br><a href="${escapeHTML(order.final_file_url)}" target="_blank" rel="noopener">Lihat file hasil</a></p>`
        : `<p><strong>File hasil akhir:</strong> Belum tersedia</p>`;

    const canVerify = order.status === "waiting_verification" && order.payment_status === "awaiting_verification";

    content.innerHTML = `
        <h3>Detail Pesanan</h3>

        <p><strong>ID Pesanan:</strong><br>${escapeHTML(order.id || "-")}</p>
        <p><strong>Artwork:</strong> ${escapeHTML(artworkTitle)}</p>
        <p><strong>Buyer:</strong> ${escapeHTML(buyerName)}</p>
        <p><strong>Seller:</strong> ${escapeHTML(sellerName)}</p>
        <p><strong>Tanggal Pesanan:</strong> ${escapeHTML(formatDateTime(order.created_at))}</p>

        <hr>

        <h4>Spesifikasi Buyer</h4>
        <p><strong>Ukuran:</strong> ${escapeHTML(order.size || "-")}</p>
        <p><strong>Resolusi:</strong> ${escapeHTML(order.resolution || "-")}</p>
        <p><strong>Format File:</strong> ${escapeHTML(order.file_format || "-")}</p>
        <p><strong>Jumlah:</strong> ${Number(order.quantity || 1)}</p>
        <p><strong>WhatsApp:</strong> ${escapeHTML(order.whatsapp || "-")}</p>
        <p><strong>Brief:</strong><br>${escapeHTML(briefText)}</p>
        <p><strong>Catatan Tambahan:</strong><br>${escapeHTML(extraNote)}</p>

        <hr>

        <h4>Rincian Harga & Alur Pembayaran</h4>
        <p>Harga dasar: <strong>${formatRupiah(pricing.basePrice)}</strong></p>
        <p>Biaya tambahan (ditentukan Seller): <strong>${formatRupiah(pricing.additionalFee)}</strong></p>
        <p><strong>Catatan biaya tambahan:</strong><br>${escapeHTML(order.additional_fee_note || "-")}</p>
        <p><strong>Catatan penawaran Seller:</strong><br>${escapeHTML(order.seller_quote_note || "-")}</p>
        <p>Subtotal yang dibayar Buyer: <strong>${formatRupiah(pricing.subtotal)}</strong></p>
        <p>Komisi platform (${pricing.commissionRate}%): <strong>${formatRupiah(pricing.commission)}</strong></p>
        <p>Pendapatan Seller: <strong>${formatRupiah(pricing.sellerEarning)}</strong></p>

        <hr>

        <h4>Status & Pembayaran</h4>
        <p><strong>Status pesanan:</strong> ${statusBadge(order.status)}</p>
        <p><strong>Status pembayaran:</strong> ${statusBadge(order.payment_status, PAYMENT_STATUS_LABELS)}</p>
        <p><strong>Metode pembayaran:</strong> ${escapeHTML(order.payment_method || "-")}</p>
        ${proofHTML}
        <p><strong>Progress pengerjaan:</strong> ${Number(order.progress || 0)}%</p>
        <p><strong>Catatan progress:</strong><br>${escapeHTML(order.progress_note || "-")}</p>
        ${finalHTML}

        ${
            canVerify
                ? `
                    <div class="artwork-actions" style="margin-top:16px;">
                        <button type="button" class="approve-button" onclick="verifyPayment('${order.id}')">Verifikasi Pembayaran</button>
                        <button type="button" class="reject-button" onclick="rejectPayment('${order.id}')">Tolak Pembayaran</button>
                    </div>
                `
                : `<p><small>Verifikasi pembayaran tersedia saat status pesanan <strong>Menunggu Verifikasi Pembayaran</strong> dan bukti pembayaran sudah diunggah.</small></p>`
        }
    `;
}

function openOrderDetail(id) {
    const order = adminOrders.find((item) => item.id === id);
    if (!order) return;

    selectedOrderId = id;
    renderOrderDetail(order);
    $("orderModal")?.classList.remove("hidden");
}

function closeOrderDetail() {
    selectedOrderId = null;
    $("orderModal")?.classList.add("hidden");
}

/* =========================================================
   PAYMENT VERIFICATION
========================================================= */

async function verifyPayment(id) {
    const order = adminOrders.find((item) => item.id === id);
    if (!order) return;

    if (!(order.status === "waiting_verification" && order.payment_status === "awaiting_verification")) {
        showMessage("Pesanan ini tidak dalam status menunggu verifikasi pembayaran.", true);
        return;
    }

    if (!confirm("Verifikasi pembayaran pesanan ini? Status akan menjadi Pembayaran Terverifikasi.")) return;

    try {
        const { data, error } = await supabaseClient
            .from("orders")
            .update({
                status: "confirmed",
                payment_status: "paid"
            })
            .eq("id", id)
            .eq("status", "waiting_verification")
            .eq("payment_status", "awaiting_verification")
            .select("id")
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            showMessage("Status pesanan sudah berubah. Muat ulang data.", true);
            await loadAdminOrders();
            renderAdminDashboard();
            closeOrderDetail();
            return;
        }

        await loadAdminOrders();
        renderAdminDashboard();

        const updated = adminOrders.find((item) => item.id === id);
        if (updated && selectedOrderId === id) renderOrderDetail(updated);
        else closeOrderDetail();

        showMessage("Pembayaran berhasil diverifikasi.");
    } catch (error) {
        console.error(error);
        showMessage(error.message || "Gagal memverifikasi pembayaran.", true);
    }
}

async function rejectPayment(id) {
    const order = adminOrders.find((item) => item.id === id);
    if (!order) return;

    if (!(order.status === "waiting_verification" && order.payment_status === "awaiting_verification")) {
        showMessage("Pesanan ini tidak dalam status menunggu verifikasi pembayaran.", true);
        return;
    }

    const reason = prompt("Masukkan alasan penolakan pembayaran (opsional):");
    if (reason === null) return;

    try {
        const { data, error } = await supabaseClient
            .from("orders")
            .update({
                status: "waiting_payment",
                payment_status: "rejected"
            })
            .eq("id", id)
            .eq("status", "waiting_verification")
            .eq("payment_status", "awaiting_verification")
            .select("id")
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            showMessage("Status pesanan sudah berubah. Muat ulang data.", true);
            await loadAdminOrders();
            renderAdminDashboard();
            closeOrderDetail();
            return;
        }

        await loadAdminOrders();
        renderAdminDashboard();

        const updated = adminOrders.find((item) => item.id === id);
        if (updated && selectedOrderId === id) renderOrderDetail(updated);
        else closeOrderDetail();

        const note = reason.trim();
        showMessage(note ? `Pembayaran ditolak. Alasan: ${note}` : "Pembayaran ditolak. Buyer dapat mengunggah ulang bukti pembayaran.");
    } catch (error) {
        console.error(error);
        showMessage(error.message || "Gagal menolak pembayaran.", true);
    }
}

/* =========================================================
   DASHBOARD STATISTICS
========================================================= */

function renderAdminDashboard() {
    const totalUsers = adminUsers.length;
    const totalBuyers = adminUsers.filter((u) => u.role === "buyer").length;
    const totalSellers = adminUsers.filter((u) => u.role === "seller").length;
    const totalAdmins = adminUsers.filter((u) => u.role === "admin").length;

    const totalArtworks = adminArtworks.length;
    const pendingArtworks = adminArtworks.filter((a) => a.status === "pending").length;
    const totalOrders = adminOrders.length;

    if ($("totalUsers")) $("totalUsers").textContent = String(totalUsers);
    if ($("totalBuyers")) $("totalBuyers").textContent = String(totalBuyers);
    if ($("totalSellers")) $("totalSellers").textContent = String(totalSellers);
    if ($("totalAdmins")) $("totalAdmins").textContent = String(totalAdmins);
    if ($("totalArtworks")) $("totalArtworks").textContent = String(totalArtworks);
    if ($("pendingArtworks")) $("pendingArtworks").textContent = String(pendingArtworks);
    if ($("totalOrders")) $("totalOrders").textContent = String(totalOrders);

    renderDashboardPending();
    renderDashboardOrders();
}

/* =========================================================
   EVENTS & INIT
========================================================= */

function initAdminFilters() {
    $("searchArtwork")?.addEventListener("input", renderAdminArtworks);
    $("artworkStatusFilter")?.addEventListener("change", renderAdminArtworks);

    $("searchUser")?.addEventListener("input", renderAdminUsers);
    $("userRoleFilter")?.addEventListener("change", renderAdminUsers);

    $("searchOrder")?.addEventListener("input", renderAdminOrders);
    $("orderStatusFilter")?.addEventListener("change", renderAdminOrders);
}

function initAdminModals() {
    $("closeArtworkModal")?.addEventListener("click", () => $("artworkModal")?.classList.add("hidden"));
    $("closeRejectModal")?.addEventListener("click", () => $("rejectModal")?.classList.add("hidden"));
    $("closeOrderModal")?.addEventListener("click", closeOrderDetail);

    $("confirmRejectButton")?.addEventListener("click", rejectArtwork);

    $("artworkModal")?.addEventListener("click", (event) => {
        if (event.target === $("artworkModal")) $("artworkModal").classList.add("hidden");
    });
    $("rejectModal")?.addEventListener("click", (event) => {
        if (event.target === $("rejectModal")) $("rejectModal").classList.add("hidden");
    });
    $("orderModal")?.addEventListener("click", (event) => {
        if (event.target === $("orderModal")) closeOrderDetail();
    });
}

async function logoutAdmin() {
    if (!confirm("Yakin ingin keluar dari akun Admin?")) return;

    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        showMessage(error.message, true);
        return;
    }

    window.location.href = "index.html";
}

async function initAdminDashboard() {
    try {
        const allowed = await checkAdminAccess();
        if (!allowed) return;

        renderAdminProfile();
        initAdminNavigation();
        initAdminFilters();
        initAdminModals();

        $("adminProfileForm")?.addEventListener("submit", saveAdminProfile);
        $("logoutButton")?.addEventListener("click", logoutAdmin);

        await loadAdminData();
    } catch (error) {
        console.error("Admin initialization error:", error);
        showMessage(error.message || "Gagal memuat dashboard Admin.", true);
    }
}

window.openArtworkDetail = openArtworkDetail;
window.approveArtwork = approveArtwork;
window.openRejectModal = openRejectModal;
window.openOrderDetail = openOrderDetail;
window.closeOrderDetail = closeOrderDetail;
window.verifyPayment = verifyPayment;
window.rejectPayment = rejectPayment;

document.addEventListener("DOMContentLoaded", initAdminDashboard);
