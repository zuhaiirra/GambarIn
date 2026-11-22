
/* =====================================================
   GAMBARIN! - SELLER DASHBOARD
   Seller: Artwork, Orders, Quotation, Progress
   Platform commission: 10%
   Artwork Archive System
===================================================== */

const SELLER_COMMISSION_RATE = 10;

let sellerUser = null;
let sellerProfile = null;
let sellerArtworks = [];
let sellerOrders = [];

const rupiah = (amount) => new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
}).format(Number(amount || 0));

const escapeHTML = (value) => {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#039;"
    })[char]);
};

const showMessage = (element, message, success = false) => {
    if (!element) return;
    element.textContent = message;
    element.style.color = success ? "#168653" : "#d64545";
};

const setButtonLoading = (button, loading, loadingText = "Memproses...") => {
    if (!button) return;

    if (loading) {
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }
        button.disabled = true;
        button.textContent = loadingText;
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || "Simpan";
        delete button.dataset.originalText;
    }
};

/* =====================================================
   ORDER STATUS
===================================================== */

const statusLabels = {
    pending: "Menunggu Penawaran Seller",
    waiting_seller_quote: "Menunggu Penawaran Seller",
    waiting_buyer_approval: "Menunggu Persetujuan Buyer",
    waiting_payment: "Menunggu Pembayaran",
    waiting_verification: "Menunggu Verifikasi",
    confirmed: "Pembayaran Dikonfirmasi",
    in_progress: "Sedang Dikerjakan",
    revision: "Revisi",
    completed: "Selesai",
    cancelled: "Dibatalkan"
};

const statusColors = {
    pending: "#e89a35",
    waiting_seller_quote: "#e89a35",
    waiting_buyer_approval: "#8b72d9",
    waiting_payment: "#e89a35",
    waiting_verification: "#4786d8",
    confirmed: "#279c70",
    in_progress: "#4786d8",
    revision: "#d58b35",
    completed: "#279c70",
    cancelled: "#d65c68"
};

function getSupabase() {
    if (typeof supabaseClient === "undefined") {
        throw new Error("Supabase client tidak ditemukan. Periksa js/supabase.js.");
    }
    return supabaseClient;
}

/* =====================================================
   AUTHENTICATION
===================================================== */

async function initializeSeller() {
    try {
        const db = getSupabase();
        const { data: { session }, error } = await db.auth.getSession();

        if (error) throw error;

        if (!session) {
            window.location.replace("./index.html");
            return;
        }

        sellerUser = session.user;

        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("*")
            .eq("id", sellerUser.id)
            .single();

        if (profileError) throw profileError;

        if (!profile || profile.role !== "seller") {
            alert("Akses hanya untuk akun Seller.");
            window.location.replace("./index.html");
            return;
        }

        sellerProfile = profile;

        renderProfile();
        setupNavigation();
        setupArtworkUpload();
        setupArtworkDelete();
        setupProfileForm();
        setupAvatarUpload();
        setupLogout();

        await Promise.all([loadArtworks(), loadOrders()]);

        updateDashboardStats();

    } catch (error) {
        console.error("Seller initialization error:", error);
        alert("Gagal memuat dashboard: " + error.message);
    }
}

/* =====================================================
   PROFILE DISPLAY
===================================================== */

function renderProfile() {
    const name = sellerProfile.full_name || sellerProfile.username || "Seller";

    const sidebarName = document.getElementById("sidebarName");
    const topbarName = document.getElementById("topbarName");
    const welcomeName = document.getElementById("welcomeName");

    if (sidebarName) sidebarName.textContent = name;
    if (topbarName) topbarName.textContent = `Welcome, ${name}!`;
    if (welcomeName) welcomeName.textContent = name;

    const nameInitial = name.charAt(0).toUpperCase();

    document.querySelectorAll(
        ".seller-mini-profile .avatar, .topbar-profile .avatar"
    ).forEach(avatar => {
        avatar.textContent = nameInitial;
    });

    const fields = {
        profileName: sellerProfile.full_name || "",
        profileUsername: sellerProfile.username || "",
        profileEmail: sellerUser.email || "",
        profileStoreName: sellerProfile.store_name || "",
        profileBio: sellerProfile.bio || "",
        profileInstagram: sellerProfile.instagram || ""
    };

    Object.entries(fields).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.value = value;
    });

    const avatarPreview = document.getElementById("profileAvatarPreview");

    if (avatarPreview) {
        avatarPreview.src = sellerProfile.avatar_url ||
            "https://placehold.co/120x120?text=Profile";
    }
}

/* =====================================================
   NAVIGATION
===================================================== */

function openSellerPage(pageId) {
    document.querySelectorAll(".page-section").forEach(section => {
        section.classList.add("hidden");
    });

    const selectedPage = document.getElementById(pageId);
    if (selectedPage) selectedPage.classList.remove("hidden");

    document.querySelectorAll(".menu-item[href^='#']").forEach(item => {
        item.classList.toggle(
            "active",
            item.getAttribute("href") === `#${pageId}`
        );
    });

    const headings = {
        dashboard: "Seller Dashboard",
        upload: "Upload Artwork",
        artworks: "My Artwork",
        orders: "My Orders",
        statistics: "Statistics",
        profile: "My Profile"
    };

    const heading = document.querySelector(".topbar h2");
    if (heading) heading.textContent = headings[pageId] || "Seller Dashboard";

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function setupNavigation() {
    document.querySelectorAll(".menu-item[href^='#']").forEach(item => {
        item.addEventListener("click", event => {
            event.preventDefault();
            openSellerPage(item.getAttribute("href").replace("#", ""));
        });
    });

    document.querySelectorAll("[data-page]").forEach(button => {
        button.addEventListener("click", () => {
            openSellerPage(button.dataset.page);
        });
    });
}

/* =====================================================
   ARTWORK UPLOAD
===================================================== */

function setupArtworkUpload() {
    const imageInput = document.getElementById("artworkImage");
    const preview = document.getElementById("imagePreview");
    const form = document.getElementById("uploadForm");

    if (!imageInput || !preview || !form) return;

    imageInput.addEventListener("change", () => {
        const file = imageInput.files[0];

        if (!file) {
            preview.textContent = "Preview gambar akan muncul di sini.";
            return;
        }

        if (!file.type.startsWith("image/")) {
            alert("File harus berupa gambar.");
            imageInput.value = "";
            return;
        }

        preview.innerHTML = "";

        const image = document.createElement("img");
        image.src = URL.createObjectURL(file);
        image.alt = "Artwork Preview";
        image.style.maxWidth = "100%";
        image.style.maxHeight = "280px";
        image.style.objectFit = "contain";

        preview.appendChild(image);
    });

    form.addEventListener("submit", uploadArtwork);
}

async function uploadArtwork(event) {
    event.preventDefault();

    const db = getSupabase();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');

    const title = document.getElementById("artworkTitle").value.trim();
    const description = document.getElementById("artworkDescription").value.trim();
const priceInput = document.getElementById("artworkPrice").value.trim();
const price = Number(priceInput.replace(/\D/g, ""));
    const category = document.getElementById("artworkCategory").value;
    const file = document.getElementById("artworkImage").files[0];

    if (!file || !title || !description || !category) {
        alert("Lengkapi semua data artwork.");
        return;
    }

    if (!Number.isFinite(price) || price < 0) {
        alert("Harga artwork tidak valid.");
        return;
    }

    setButtonLoading(button, true, "Mengunggah...");

    let uploadedFilePath = null;

    try {
        const extension = file.name.split(".").pop().toLowerCase();
        const filePath = `${sellerUser.id}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await db.storage
            .from("artworks")
            .upload(filePath, file, {
                cacheControl: "3600",
                upsert: false
            });

        if (uploadError) throw uploadError;
        uploadedFilePath = filePath;

        const { data: imageData } = db.storage
            .from("artworks")
            .getPublicUrl(filePath);

        const { error: insertError } = await db
            .from("artworks")
            .insert({
                seller_id: sellerUser.id,
                title,
                description,
                price,
                category,
                image_url: imageData.publicUrl,
                is_archived: false
            });

        if (insertError) throw insertError;

        uploadedFilePath = null;

        alert("Artwork berhasil diunggah dan menunggu persetujuan Admin!");

        form.reset();

        const preview = document.getElementById("imagePreview");
        if (preview) {
            preview.textContent = "Preview gambar akan muncul di sini.";
        }

        await loadArtworks();
        updateDashboardStats();
        openSellerPage("artworks");

    } catch (error) {
        if (uploadedFilePath) {
            await db.storage.from("artworks").remove([uploadedFilePath]);
        }

        console.error("Upload artwork error:", error);
        alert("Gagal mengunggah artwork: " + error.message);
    } finally {
        setButtonLoading(button, false);
    }
}

/* =====================================================
   LOAD ARTWORKS
===================================================== */

async function loadArtworks() {
    const db = getSupabase();

    const { data, error } = await db
        .from("artworks")
        .select("*")
        .eq("seller_id", sellerUser.id)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Load artworks error:", error);
        return;
    }

    sellerArtworks = data || [];
    renderArtworkList();
}

function renderArtworkList() {
    const container = document.getElementById("myArtworkList");
    const recentContainer = document.getElementById("recentArtworkList");

    if (!container || !recentContainer) return;

    if (!sellerArtworks.length) {
        const emptyHTML = `
            <div class="empty-state">
                <div class="empty-icon">🎨</div>
                <h3>Belum ada artwork</h3>
                <p>Karya yang kamu unggah akan muncul di sini.</p>
            </div>
        `;

        container.innerHTML = emptyHTML;
        recentContainer.innerHTML = emptyHTML;
        return;
    }

    container.innerHTML = sellerArtworks.map(artwork => {
        const status = artwork.status || "pending";
        const archived = artwork.is_archived === true;

        return `
            <article class="artwork-card">
                <img
                    src="${escapeHTML(artwork.image_url)}"
                    alt="${escapeHTML(artwork.title)}"
                    loading="lazy"
                >

                <div class="artwork-card-content">
                    <h3>${escapeHTML(artwork.title)}</h3>
                    <p>${escapeHTML(artwork.category || "Other")}</p>
                    <strong>${rupiah(artwork.price)}</strong>

                    <span class="order-status"
                        style="background:${archived ? "#eeeeee" : status === "approved" ? "#e5f7ef" : status === "rejected" ? "#fde8e8" : "#fff4df"};
                        color:${archived ? "#666" : status === "approved" ? "#168653" : status === "rejected" ? "#c43f3f" : "#b4771c"};">
                        ${archived ? "Diarsipkan" : escapeHTML(status)}
                    </span>

                    ${
                        artwork.rejection_reason
                            ? `<p class="artwork-rejection">${escapeHTML(artwork.rejection_reason)}</p>`
                            : ""
                    }

                    <button
                        type="button"
                        class="delete-artwork-button"
                        data-toggle-archive="${escapeHTML(artwork.id)}"
                        style="
                            width:100%;
                            margin-top:12px;
                            padding:10px 14px;
                            border:0;
                            border-radius:8px;
                            background:${archived ? "#e5f7ef" : "#fde8e8"};
                            color:${archived ? "#168653" : "#c43f3f"};
                            font-weight:600;
                            cursor:pointer;
                        "
                    >
                        ${archived ? "↩ Tampilkan Kembali" : "🗑 Hapus dari Katalog"}
                    </button>
                </div>
            </article>
        `;
    }).join("");

    const activeArtworks = sellerArtworks.filter(
        artwork => artwork.is_archived !== true
    );

    if (!activeArtworks.length) {
        recentContainer.innerHTML = `
            <div class="empty-state">
                <h3>Belum ada artwork aktif</h3>
                <p>Artwork yang diarsipkan tidak ditampilkan di sini.</p>
            </div>
        `;
    } else {
        recentContainer.innerHTML = `
            <div class="artwork-grid">
                ${activeArtworks.slice(0, 3).map(artwork => `
                    <article class="artwork-card">
                        <img
                            src="${escapeHTML(artwork.image_url)}"
                            alt="${escapeHTML(artwork.title)}"
                        >
                        <div class="artwork-card-content">
                            <h3>${escapeHTML(artwork.title)}</h3>
                            <strong>${rupiah(artwork.price)}</strong>
                        </div>
                    </article>
                `).join("")}
            </div>
        `;
    }
}

/* =====================================================
   ARCHIVE / RESTORE ARTWORK
===================================================== */

function setupArtworkDelete() {
    const container = document.getElementById("myArtworkList");

    if (!container) return;

    container.addEventListener("click", async event => {
        const button = event.target.closest("[data-toggle-archive]");

        if (!button) return;

        const artworkId = button.dataset.toggleArchive;
        await toggleArtworkArchive(artworkId, button);
    });
}

async function toggleArtworkArchive(artworkId, button) {
    const artwork = sellerArtworks.find(
        item => String(item.id) === String(artworkId)
    );

    if (!artwork) {
        alert("Artwork tidak ditemukan.");
        return;
    }

    const currentlyArchived = artwork.is_archived === true;
    const newArchiveStatus = !currentlyArchived;

    const message = newArchiveStatus
        ? `Arsipkan "${artwork.title}" dari katalog?\n\nArtwork tidak akan tampil di Home, tetapi data dan riwayat pesanannya tetap tersimpan.`
        : `Tampilkan kembali "${artwork.title}" di katalog?`;

    if (!confirm(message)) return;

    const db = getSupabase();

    setButtonLoading(button, true, "Memproses...");

    try {
        const { data, error } = await db
            .from("artworks")
            .update({
                is_archived: newArchiveStatus
            })
            .eq("id", artwork.id)
            .eq("seller_id", sellerUser.id)
            .select("id, is_archived");

        if (error) throw error;

        if (!data || data.length === 0) {
            throw new Error(
                "Perubahan tidak tersimpan. Periksa izin UPDATE pada tabel artworks di Supabase."
            );
        }

        alert(
            newArchiveStatus
                ? "Artwork berhasil diarsipkan dari katalog!"
                : "Artwork berhasil ditampilkan kembali!"
        );

        await loadArtworks();
        updateDashboardStats();

    } catch (error) {
        console.error("Archive artwork error:", error);
        alert("Gagal memproses artwork: " + error.message);
    } finally {
        if (button && document.body.contains(button)) {
            setButtonLoading(button, false);
        }
    }
}

/* =====================================================
   LOAD ORDERS
===================================================== */

async function loadOrders() {
    const db = getSupabase();

    const { data, error } = await db
        .from("orders")
        .select("*")
        .eq("seller_id", sellerUser.id)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Load orders error:", error);

        const container = document.getElementById("sellerOrderList");

        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Gagal memuat pesanan</h3>
                    <p>${escapeHTML(error.message)}</p>
                </div>
            `;
        }
        return;
    }

    sellerOrders = data || [];

    await loadOrderRelatedData();
    renderOrders();
    updateOrderStats();
}

async function loadOrderRelatedData() {
    const db = getSupabase();

    const buyerIds = [
        ...new Set(sellerOrders.map(order => order.buyer_id).filter(Boolean))
    ];

    const artworkIds = [
        ...new Set(sellerOrders.map(order => order.artwork_id).filter(Boolean))
    ];

    const [buyerResult, artworkResult] = await Promise.all([
        buyerIds.length
            ? db.from("profiles")
                .select("id, full_name, username, avatar_url")
                .in("id", buyerIds)
            : Promise.resolve({ data: [], error: null }),

        artworkIds.length
            ? db.from("artworks")
                .select("id, title, image_url, price")
                .in("id", artworkIds)
            : Promise.resolve({ data: [], error: null })
    ]);

    if (buyerResult.error) {
        console.error("Load buyer information error:", buyerResult.error);
    }

    if (artworkResult.error) {
        console.error("Load artwork information error:", artworkResult.error);
    }

    const buyers = buyerResult.data || [];
    const artworks = artworkResult.data || [];

    sellerOrders = sellerOrders.map(order => ({
        ...order,
        buyer: buyers.find(buyer => buyer.id === order.buyer_id) || null,
        artwork: artworks.find(artwork => artwork.id === order.artwork_id) || null
    }));
}

/* =====================================================
   ORDER STATISTICS
===================================================== */

function updateOrderStats() {
    const waitingQuote = document.getElementById("waitingQuoteCount");
    const waitingPayment = document.getElementById("waitingPaymentCount");
    const working = document.getElementById("workingOrderCount");
    const finished = document.getElementById("finishedOrderCount");

    if (waitingQuote) {
        waitingQuote.textContent = sellerOrders.filter(order =>
            ["pending", "waiting_seller_quote"].includes(order.status)
        ).length;
    }

    if (waitingPayment) {
        waitingPayment.textContent = sellerOrders.filter(order =>
            ["waiting_buyer_approval", "waiting_payment", "waiting_verification"]
                .includes(order.status)
        ).length;
    }

    if (working) {
        working.textContent = sellerOrders.filter(order =>
            ["confirmed", "in_progress", "revision"].includes(order.status)
        ).length;
    }

    if (finished) {
        finished.textContent = sellerOrders.filter(order =>
            order.status === "completed"
        ).length;
    }
}

/* =====================================================
   ORDER RENDERING
===================================================== */

function renderOrders() {
    const container = document.getElementById("sellerOrderList");

    if (!container) return;

    if (!sellerOrders.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <h3>Belum ada pesanan</h3>
                <p>Pesanan dari Buyer akan muncul di sini.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = sellerOrders.map(order => {
        const buyerName =
            order.buyer?.full_name ||
            order.buyer?.username ||
            "Buyer";

        const artworkTitle = order.artwork?.title || "Artwork";
        const status = order.status;

        return `
            <article class="seller-order-card">
                <div class="seller-order-header">
                    <div>
                        <h3>${escapeHTML(artworkTitle)}</h3>
                        <p>Buyer: ${escapeHTML(buyerName)}</p>
                        <small>Order ID: ${escapeHTML(order.id)}</small>
                    </div>

                    <span class="order-status"
                        style="background:${statusColors[status] || "#eeeeee"}20;
                        color:${statusColors[status] || "#555"};">
                        ${escapeHTML(statusLabels[status] || status)}
                    </span>
                </div>

                <div class="seller-order-content">
                    ${
                        order.artwork?.image_url
                            ? `<img class="seller-order-image"
                                src="${escapeHTML(order.artwork.image_url)}"
                                alt="${escapeHTML(artworkTitle)}">`
                            : ""
                    }

                    <div class="seller-order-details">
                        <p><strong>Harga dasar:</strong> ${rupiah(order.base_price)}</p>
                        <p><strong>Jumlah:</strong> ${Number(order.quantity || 1)}</p>
                        <p><strong>Ukuran:</strong> ${escapeHTML(order.size || "-")}</p>
                        <p><strong>Resolusi:</strong> ${escapeHTML(order.resolution || "-")}</p>
                        <p><strong>Format file:</strong> ${escapeHTML(order.file_format || "-")}</p>
                        <p><strong>Brief Buyer:</strong><br>
                            ${escapeHTML(order.brief || order.note || "-")}
                        </p>
                        <p><strong>WhatsApp:</strong> ${escapeHTML(order.whatsapp || "-")}</p>
                    </div>
                </div>

                ${renderOrderAction(order)}
            </article>
        `;
    }).join("");
}

/* =====================================================
   OPEN / CLOSE QUOTE FORM
===================================================== */

function toggleQuoteForm(orderId) {
    const form = document.getElementById(`quote-form-${orderId}`);

    if (!form) {
        console.error("Form penawaran tidak ditemukan:", orderId);
        return;
    }

    form.hidden = !form.hidden;
}

/* =====================================================
   ORDER ACTIONS
===================================================== */

function renderOrderAction(order) {
    if (["pending", "waiting_seller_quote"].includes(order.status)) {
        const basePrice = Number(order.base_price || 0);
        const initialCommission = Math.round(
            basePrice * SELLER_COMMISSION_RATE / 100
        );

        return `
            <div class="seller-order-action quote-action">
                <button type="button" class="btn-quote"
                    onclick="toggleQuoteForm('${escapeHTML(order.id)}')">
                    💰 Beri Harga
                </button>

                <div id="quote-form-${escapeHTML(order.id)}"
                    class="quote-form-container" hidden>
                    <h4>Penawaran Harga</h4>

                    <p>Harga dasar: <strong>${rupiah(basePrice)}</strong></p>

                    <form class="seller-quote-form"
                        data-order-id="${escapeHTML(order.id)}">

                        <label>Biaya Tambahan (Rp)</label>
                        <input type="number" name="additional_fee"
                            min="0" step="1" value="0" required>

                        <label>Catatan Biaya Tambahan</label>
                        <textarea name="additional_fee_note"
                            placeholder="Jelaskan alasan biaya tambahan, jika ada..."></textarea>

                        <div class="quote-preview">
                            <p>Subtotal Buyer:
                                <strong class="preview-subtotal">${rupiah(basePrice)}</strong>
                            </p>
                            <p>Komisi Platform (10%):
                                <strong class="preview-commission">${rupiah(initialCommission)}</strong>
                            </p>
                            <p>Pendapatan Seller:
                                <strong class="preview-earning">${rupiah(basePrice - initialCommission)}</strong>
                            </p>
                        </div>

                        <button type="submit" class="primary-button">
                            Kirim Penawaran
                        </button>
                    </form>
                </div>
            </div>
        `;
    }

    if (order.status === "waiting_buyer_approval") {
        return `
            <div class="seller-order-action">
                <h4>Menunggu Persetujuan Buyer</h4>
                <div class="quote-preview">
                    <p>Harga Dasar: ${rupiah(order.base_price)}</p>
                    <p>Biaya Tambahan: ${rupiah(order.additional_fee)}</p>
                    <p>Subtotal Buyer: <strong>${rupiah(order.service_subtotal)}</strong></p>
                    <p>Komisi Platform: ${rupiah(order.platform_fee_amount)}</p>
                    <p>Pendapatan Seller: <strong>${rupiah(order.seller_earning)}</strong></p>
                </div>
                <p>Buyer sedang mempertimbangkan penawaran harga kamu.</p>
            </div>
        `;
    }

    if (order.status === "waiting_payment") {
        return `
            <div class="seller-order-action">
                <h4>Menunggu Pembayaran Buyer</h4>
                <p>Buyer telah menyetujui harga. Tunggu pembayaran dilakukan.</p>
                <strong>Total pembayaran: ${rupiah(order.service_subtotal)}</strong>
            </div>
        `;
    }

    if (order.status === "waiting_verification") {
        return `
            <div class="seller-order-action">
                <h4>Pembayaran Menunggu Verifikasi Admin</h4>
                <p>Buyer sudah mengirim bukti pembayaran.</p>
                ${
                    order.payment_proof
                        ? `<a href="${escapeHTML(order.payment_proof)}"
                            target="_blank" rel="noopener noreferrer">
                            Lihat Bukti Pembayaran
                        </a>`
                        : ""
                }
            </div>
        `;
    }

    if (["confirmed", "in_progress", "revision"].includes(order.status)) {
        const estimatedValue = order.estimated_completion
            ? new Date(
                new Date(order.estimated_completion).getTime() -
                new Date(order.estimated_completion).getTimezoneOffset() * 60000
            ).toISOString().slice(0, 16)
            : "";

        return `
            <div class="seller-order-action">
                <h4>Update Pengerjaan</h4>
                <p>Status pembayaran:
                    <strong>${escapeHTML(order.payment_status || "-")}</strong>
                </p>
                <p>Progres saat ini: ${Number(order.progress || 0)}%</p>

                <form class="seller-progress-form"
                    data-order-id="${escapeHTML(order.id)}">

                    <label>Progres Pengerjaan (%)</label>
                    <input type="number" name="progress"
                        min="0" max="100"
                        value="${Number(order.progress || 0)}" required>

                    <label>Catatan Progres</label>
                    <textarea name="progress_note"
                        placeholder="Contoh: Sketsa awal sudah selesai.">${escapeHTML(order.progress_note || "")}</textarea>

                    <label>Estimasi Penyelesaian</label>
                    <input type="datetime-local"
                        name="estimated_completion"
                        value="${estimatedValue}">

                    <label>Status Pengerjaan</label>
                    <select name="status">
                        <option value="in_progress"
                            ${order.status === "in_progress" ? "selected" : ""}>
                            Sedang Dikerjakan
                        </option>
                        <option value="revision"
                            ${order.status === "revision" ? "selected" : ""}>
                            Revisi
                        </option>
                        <option value="completed">Selesai</option>
                    </select>

                    <label>Upload File Hasil Akhir</label>
                    <input type="file" name="final_file"
                        accept=".png,.jpg,.jpeg,.webp,.pdf,.psd,.ai,.zip">

                    <button type="submit" class="primary-button">
                        Simpan Progres
                    </button>
                </form>
            </div>
        `;
    }

    if (order.status === "completed") {
        return `
            <div class="seller-order-action">
                <h4>Pesanan Selesai ✓</h4>
                <p>Pengerjaan pesanan telah selesai.</p>
                ${
                    order.final_file_url
                        ? `<a href="${escapeHTML(order.final_file_url)}"
                            target="_blank" rel="noopener noreferrer">
                            Lihat File Hasil Akhir
                        </a>`
                        : ""
                }
                <p>Pendapatan Seller:
                    <strong>${rupiah(order.seller_earning)}</strong>
                </p>
            </div>
        `;
    }

    if (order.status === "cancelled") {
        return `
            <div class="seller-order-action">
                <h4>Pesanan Dibatalkan</h4>
                <p>Pesanan ini tidak dilanjutkan.</p>
            </div>
        `;
    }

    return "";
}

/* =====================================================
   QUOTE PREVIEW
===================================================== */

document.addEventListener("input", event => {
    if (!event.target.matches('.seller-quote-form input[name="additional_fee"]')) {
        return;
    }

    const form = event.target.closest(".seller-quote-form");
    const order = sellerOrders.find(item => item.id === form.dataset.orderId);

    if (!order) return;

    const additionalFee = Math.max(0, Number(event.target.value) || 0);
    const subtotal = Number(order.base_price) + additionalFee;
    const commission = Math.round(subtotal * SELLER_COMMISSION_RATE / 100);
    const earning = subtotal - commission;

    form.querySelector(".preview-subtotal").textContent = rupiah(subtotal);
    form.querySelector(".preview-commission").textContent = rupiah(commission);
    form.querySelector(".preview-earning").textContent = rupiah(earning);
});

/* =====================================================
   FORM SUBMISSION LISTENER
===================================================== */

document.addEventListener("submit", async event => {
    if (event.target.matches(".seller-quote-form")) {
        event.preventDefault();
        await submitSellerQuote(event.target);
    }

    if (event.target.matches(".seller-progress-form")) {
        event.preventDefault();
        await submitSellerProgress(event.target);
    }
});

/* =====================================================
   SUBMIT SELLER QUOTE
===================================================== */

async function submitSellerQuote(form) {
    const db = getSupabase();
    const orderId = form.dataset.orderId;

    const additionalFee = Number(
        form.querySelector('[name="additional_fee"]').value
    );

    const note = form.querySelector('[name="additional_fee_note"]').value.trim();
    const order = sellerOrders.find(item => item.id === orderId);

    if (!order) {
        alert("Pesanan tidak ditemukan.");
        return;
    }

    if (!Number.isFinite(additionalFee) || additionalFee < 0) {
        alert("Biaya tambahan tidak valid.");
        return;
    }

    const basePrice = Number(order.base_price);

    if (!Number.isFinite(basePrice) || basePrice < 0) {
        alert("Harga dasar pesanan tidak valid.");
        return;
    }

    const subtotal = basePrice + additionalFee;
    const platformFee = Math.round(subtotal * SELLER_COMMISSION_RATE / 100);
    const sellerEarning = subtotal - platformFee;

    const button = form.querySelector('button[type="submit"]');
    setButtonLoading(button, true, "Mengirim...");

    try {
        const { data, error } = await db
            .from("orders")
            .update({
                additional_fee: additionalFee,
                additional_fee_note: note,
                service_subtotal: subtotal,
                platform_fee_amount: platformFee,
                seller_earning: sellerEarning,
                status: "waiting_buyer_approval"
            })
            .eq("id", orderId)
            .eq("seller_id", sellerUser.id)
            .in("status", ["pending", "waiting_seller_quote"])
            .select("id");

        if (error) throw error;

        if (!data || data.length === 0) {
            throw new Error(
                "Pesanan tidak berhasil diperbarui. Periksa izin RLS, seller_id, atau status pesanan."
            );
        }

        alert("Penawaran harga berhasil dikirim ke Buyer!");

        await loadOrders();
        updateDashboardStats();

    } catch (error) {
        console.error("Submit quote error:", error);
        alert("Gagal mengirim penawaran: " + error.message);
    } finally {
        setButtonLoading(button, false);
    }
}

/* =====================================================
   PROGRESS UPDATE AND FINAL FILE UPLOAD
===================================================== */

async function submitSellerProgress(form) {
    const db = getSupabase();
    const orderId = form.dataset.orderId;
    const order = sellerOrders.find(item => item.id === orderId);

    if (!order) {
        alert("Pesanan tidak ditemukan.");
        return;
    }

    const progress = Number(form.querySelector('[name="progress"]').value);
    const progressNote = form.querySelector('[name="progress_note"]').value.trim();
    const status = form.querySelector('[name="status"]').value;
    const estimatedValue = form.querySelector('[name="estimated_completion"]').value;
    const finalFile = form.querySelector('[name="final_file"]').files[0];

    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
        alert("Progres harus antara 0 sampai 100.");
        return;
    }

    if (status === "completed" && !finalFile && !order.final_file_url) {
        alert("Upload file hasil akhir sebelum menyelesaikan pesanan.");
        return;
    }

    const button = form.querySelector('button[type="submit"]');
    setButtonLoading(button, true, "Menyimpan...");

    try {
        let finalFileUrl = order.final_file_url || null;

        if (finalFile) {
            const extension = finalFile.name.split(".").pop().toLowerCase();
            const filePath =
                `${sellerUser.id}/${orderId}/${crypto.randomUUID()}.${extension}`;

            const { error: uploadError } = await db.storage
                .from("final_deliveries")
                .upload(filePath, finalFile, {
                    cacheControl: "3600",
                    upsert: false
                });

            if (uploadError) throw uploadError;

            const { data: fileData } = db.storage
                .from("final_deliveries")
                .getPublicUrl(filePath);

            finalFileUrl = fileData.publicUrl;
        }

        const updates = {
            progress,
            progress_note: progressNote,
            status,
            final_file_url: finalFileUrl,
            estimated_completion: estimatedValue
                ? new Date(estimatedValue).toISOString()
                : null
        };

        const { error } = await db
            .from("orders")
            .update(updates)
            .eq("id", orderId)
            .eq("seller_id", sellerUser.id);

        if (error) throw error;

        alert("Progres pesanan berhasil diperbarui!");

        await loadOrders();
        updateDashboardStats();

    } catch (error) {
        console.error("Update progress error:", error);
        alert("Gagal memperbarui pesanan: " + error.message);
    } finally {
        setButtonLoading(button, false);
    }
}

/* =====================================================
   DASHBOARD STATISTICS
===================================================== */

function updateDashboardStats() {
    const totalArtwork = document.getElementById("totalArtwork");
    const pendingArtwork = document.getElementById("pendingArtwork");
    const totalOrders = document.getElementById("totalOrders");
    const completedOrders = document.getElementById("completedOrders");

    const activeArtworks = sellerArtworks.filter(
        artwork => artwork.is_archived !== true
    );

    if (totalArtwork) {
        totalArtwork.textContent = activeArtworks.length;
    }

    if (pendingArtwork) {
        pendingArtwork.textContent =
            activeArtworks.filter(artwork => artwork.status === "pending").length;
    }

    if (totalOrders) totalOrders.textContent = sellerOrders.length;

    if (completedOrders) {
        completedOrders.textContent =
            sellerOrders.filter(order => order.status === "completed").length;
    }
}

/* =====================================================
   PROFILE UPDATE
===================================================== */

function setupProfileForm() {
    const form = document.getElementById("profileForm");
    if (!form) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const button = form.querySelector('button[type="submit"]');
        const message = document.getElementById("profileMessage");

        const updates = {
            full_name: document.getElementById("profileName").value.trim(),
            username: document.getElementById("profileUsername").value.trim(),
            store_name: document.getElementById("profileStoreName").value.trim(),
            bio: document.getElementById("profileBio").value.trim(),
            instagram: document.getElementById("profileInstagram").value.trim()
        };

        setButtonLoading(button, true, "Menyimpan...");

        try {
            const db = getSupabase();

            const { data, error } = await db
                .from("profiles")
                .update(updates)
                .eq("id", sellerUser.id)
                .select()
                .single();

            if (error) throw error;

            sellerProfile = data;
            renderProfile();

            showMessage(message, "Profil berhasil diperbarui!", true);

        } catch (error) {
            console.error("Profile update error:", error);
            showMessage(message, "Gagal menyimpan profil: " + error.message);
        } finally {
            setButtonLoading(button, false);
        }
    });
}

/* =====================================================
   AVATAR UPLOAD
===================================================== */

function setupAvatarUpload() {
    const input = document.getElementById("profileAvatar");
    if (!input) return;

    input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("File harus berupa gambar.");
            input.value = "";
            return;
        }

        const preview = document.getElementById("profileAvatarPreview");
        const message = document.getElementById("profileMessage");
        const oldPreview = preview.src;

        preview.src = URL.createObjectURL(file);

        try {
            const db = getSupabase();
            const extension = file.name.split(".").pop().toLowerCase();
            const filePath =
                `${sellerUser.id}/avatar-${crypto.randomUUID()}.${extension}`;

            const { error: uploadError } = await db.storage
                .from("avatars")
                .upload(filePath, file, {
                    cacheControl: "3600",
                    upsert: false
                });

            if (uploadError) throw uploadError;

            const { data } = db.storage
                .from("avatars")
                .getPublicUrl(filePath);

            const { data: profile, error: updateError } = await db
                .from("profiles")
                .update({ avatar_url: data.publicUrl })
                .eq("id", sellerUser.id)
                .select()
                .single();

            if (updateError) throw updateError;

            sellerProfile = profile;
            renderProfile();

            showMessage(message, "Foto profil berhasil diperbarui!", true);

        } catch (error) {
            console.error("Avatar upload error:", error);
            preview.src = oldPreview;
            showMessage(message, "Gagal mengunggah foto: " + error.message);
        } finally {
            input.value = "";
        }
    });
}

/* =====================================================
   LOGOUT
===================================================== */

function setupLogout() {
    const logoutButton = document.getElementById("logoutButton");
    if (!logoutButton) return;

    logoutButton.addEventListener("click", async () => {
        const confirmed = confirm("Apakah kamu yakin ingin logout?");
        if (!confirmed) return;

        logoutButton.disabled = true;

        try {
            const db = getSupabase();
            const { error } = await db.auth.signOut();

            if (error) throw error;

            window.location.replace("./index.html");

        } catch (error) {
            console.error("Logout error:", error);
            alert("Gagal logout: " + error.message);
            logoutButton.disabled = false;
        }
    });
}

/* =====================================================
   START APPLICATION
===================================================== */

document.addEventListener("DOMContentLoaded", initializeSeller);
