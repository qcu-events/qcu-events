(function () {
    "use strict";

    // Settings
    const POST_PAGE_URL = "Post-Event.html";
    const MODAL_HTML_URL = "eventpopup.html";
    const CATEGORY_LABELS = { "academics": "Academics", "non-academic": "Non-Academic", "sports": "Sports" };
    const PUBLIC_PAGES = ["index.html", "login.html", "signup.html"];
    const API = "Events.php";
    const ORGANIZER_ONLY = ["post-event.html", "createdevents.html", "organizerpage.html"];

    const path = window.location.pathname;
    const pageName = (path.split("/").pop() || "index.html").toLowerCase();
    const isPublicPage = path.endsWith("/") || PUBLIC_PAGES.indexOf(pageName) !== -1;

    const root = document.documentElement;
    if (!isPublicPage) root.style.visibility = "hidden";

    let me = null;             
    let isOrganizer = false;

    async function api(url, options) {
        options = options || {};
        const init = { method: options.method || "GET", credentials: "same-origin", headers: {} };
        if (options.json !== undefined) {
            init.headers["Content-Type"] = "application/json";
            init.body = JSON.stringify(options.json);
        }
        if (options.form) init.body = options.form;

        let response;
        try {
            response = await fetch(url, init);
        } catch (error) {
            throw new Error("Cannot reach the server. Check your connection, or make sure Apache and MySQL are running if you are testing on your own computer.");
        }

        let data = {};
        try { data = await response.json(); } catch (error) { /* no JSON body */ }
        if (!response.ok) {
            const problem = new Error(data.error || ("The server answered with error " + response.status + ". If you are testing on your own computer, open the site through Apache (for example http://localhost:8080/website/), not through Live Server."));
            problem.status = response.status;
            throw problem;
        }
        return data;
    }

    // Dates
    function toDate(text) {
        const [y, m, d] = text.split("-").map(Number);
        return new Date(y, m - 1, d);
    }

    function today() {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return now;
    }

    function todayText() {
        const t = today();
        return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
    }

    // status of events
    function getStatus(event) {
        if (!event.date) return "upcoming";
        const start = toDate(event.date);
        const end = event.endDate ? toDate(event.endDate) : start;
        const now = today();
        if (end < now) return "past";
        if (start <= now) return "current";
        return "upcoming";
    }

    function getTagText(event, status) {
        if (status === "current") return "HAPPENING NOW";
        const days = Math.round((toDate(event.date) - today()) / 86400000);
        if (days === 1) return "HAPPENING TOMORROW";
        return days <= 7 ? "COMING SOON" : "UPCOMING";
    }

    const DATE_FORMAT = { year: "numeric", month: "long", day: "numeric" };

    function formatDate(event) {
        if (!event.date) return "Date to be announced";
        const start = toDate(event.date).toLocaleDateString("en-US", DATE_FORMAT);
        if (event.endDate && event.endDate !== event.date) {
            return start + " - " + toDate(event.endDate).toLocaleDateString("en-US", DATE_FORMAT);
        }
        return start;
    }

    function formatTime(time) {
        return new Date("2000-01-01T" + time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }

    // ISO string -> "November 9, 2026" (or "-" if invalid)
    function formatIso(iso) {
        const date = new Date(iso);
        return isNaN(date) ? "-" : date.toLocaleDateString("en-US", DATE_FORMAT);
    }

    // Small DOM helpers
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function makeRow(values) {
        const row = el("tr");
        values.forEach(function (text) { row.appendChild(el("td", "", text)); });
        return row;
    }

    function badge(text, className) {
        return el("span", "status " + className, text);
    }

    // Message line shown inside a form (errors / success)
    function formMessage(form, text, isError) {
        let note = form.querySelector(".form-message");
        if (!note) {
            note = el("p", "form-message");
            note.setAttribute("role", "status");
            note.style.cssText = "margin:0 0 12px;font-size:12px;font-weight:700;";
            form.insertBefore(note, form.firstChild);
        }
        note.style.color = isError ? "#b3261e" : "#2e7d32";
        note.textContent = text;
    }

    function fieldValue(form, name) {
        for (const item of form.elements) {
            if (item.name && item.name.toLowerCase() === name.toLowerCase()) return item.value;
        }
        return "";
    }

    function homePage() {
        return isOrganizer ? "organizerpage.html" : "participantpage.html";
    }

    // Links, menus, login, sign up, log out
    function setupPageBasics() {
        document.querySelectorAll("[data-home]").forEach(function (link) {
            link.setAttribute("href", homePage() + (link.getAttribute("data-home") || ""));
        });

        document.querySelectorAll("[data-logout]").forEach(function (link) {
            link.addEventListener("click", async function (e) {
                e.preventDefault();
                try { await api(API + "?action=logout", { method: "POST" }); } catch (error) { /* leave anyway */ }
                window.location.href = link.getAttribute("href");
            });
        });

        const menus = document.querySelectorAll("details.user-menu");
        document.addEventListener("click", function (e) {
            menus.forEach(function (menu) {
                if (menu.open && !menu.contains(e.target)) menu.open = false;
            });
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") menus.forEach(function (menu) { menu.open = false; });
        });
    }

    // Account sidebar: participants see "History of Registered Events", organizers see "Events Created"
    function setupSidebarForRole() {
        document.querySelectorAll(".side a[data-role]").forEach(function (link) {
            if (link.getAttribute("data-role") !== (isOrganizer ? "organizer" : "participant")) {
                link.remove();
            }
        });
    }

    // Event card
    function createEventCard(event, status) {
        const card = el("a", "event-card");
        card.dataset.status = status;
        card.dataset.category = event.category || "";

        const grid = document.getElementById("eventGrid");
        if (grid && grid.hasAttribute("data-guest")) {
            card.href = "login.html"; // visitors must log in first
        } else {
            card.href = "#";
            card.setAttribute("aria-haspopup", "dialog");
            card.addEventListener("click", function (e) {
                e.preventDefault();
                openEventDetails(event, status);
            });
        }

        const image = el("img", "event-photo");
        image.src = event.photo;
        image.alt = event.name;

        const info = el("div", "event-info");
        info.appendChild(el("span", "event-tag" + (status === "current" ? " live" : ""), getTagText(event, status)));
        info.appendChild(el("h3", "", event.name));
        info.appendChild(el("p", "", event.about));
        info.appendChild(el("p", "event-date", formatDate(event)));
        if (event.time) info.appendChild(el("p", "", "Time: " + formatTime(event.time)));
        info.appendChild(el("p", "", "Venue: " + event.venue));
        info.appendChild(el("p", "", "Organization: " + event.organization));

        card.appendChild(image);
        card.appendChild(info);
        return card;
    }

    // Event details pop-up
    let modal = null;
    let modalPromise = null;
    let lastFocused = null;
    let currentEvent = null;

    function buildModal(html) {
        const overlay = el("div", "qcu-modal-overlay");
        overlay.hidden = true;
        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        const q = function (selector) { return overlay.querySelector(selector); };

        modal = {
            overlay: overlay,
            scroll: q(".qcu-modal-scroll"),
            close: q(".qcu-modal-close"),
            photo: q(".qcu-modal-photo"),
            tag: q(".qcu-modal-tag"),
            title: q("h2"),
            about: q(".qcu-modal-about"),
            details: q(".qcu-modal-details"),
            count: q(".qcu-register-count"),
            registerBtn: q("#qcuRegisterBtn"),
            form: q(".qcu-register-form"),
            msg: q(".qcu-register-msg"),
            editBtn: q(".qcu-edit-btn"),
            ownerTools: q(".qcu-owner-tools"),
            deleteBtn: q(".qcu-delete-btn"),
            registrantsTitle: q(".qcu-registrants-title"),
            registrantsEmpty: q(".qcu-registrants-empty"),
            registrantsWrap: q(".qcu-registrants-wrap"),
            registrantsBody: q(".qcu-registrants-table tbody")
        };

        modal.close.addEventListener("click", closeEventDetails);
        overlay.addEventListener("click", function (e) {
            if (e.target === overlay) closeEventDetails();
        });

        modal.deleteBtn.addEventListener("click", function () {
            const question = "Delete \"" + currentEvent.name + "\"? This also removes its registrations and cannot be undone.";
            if (confirm(question)) deleteEvent(currentEvent);
        });

        modal.registerBtn.addEventListener("click", function () {
            modal.registerBtn.hidden = true;
            modal.form.hidden = false;
            modal.form.elements.fullName.focus();
        });

        modal.form.addEventListener("submit", function (e) {
            e.preventDefault();
            registerForEvent();
        });

        document.addEventListener("keydown", function (e) {
            if (overlay.hidden) return;
            if (e.key === "Escape") {
                closeEventDetails();
            } else if (e.key === "Tab") {
                keepFocusInside(e);
            }
        });
    }

    // Tab cycles inside the pop-up
    function keepFocusInside(e) {
        const items = Array.from(modal.overlay.querySelectorAll("button, input, a[href]"))
            .filter(function (item) { return item.offsetParent !== null; });
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;

        if (!modal.overlay.contains(active) || (e.shiftKey && active === first)) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    }

    function showMessage(text, isError) {
        modal.msg.textContent = text;
        modal.msg.className = "qcu-register-msg" + (isError ? " error" : "");
    }

    function updateRegisterCount() {
        const count = currentEvent.registeredCount || 0;
        modal.count.textContent = count + (count === 1 ? " person registered" : " people registered");
    }

    async function registerForEvent() {
        const form = modal.form.elements;
        const button = modal.form.querySelector('[type="submit"]');
        button.disabled = true;

        try {
            const result = await api(API + "?action=register&id=" + currentEvent.id, {
                method: "POST",
                json: {
                    fullName: form.fullName.value.trim(),
                    studentId: form.studentId.value.trim(),
                    email: form.email.value.trim()
                }
            });
            currentEvent.registeredCount = result.registeredCount;
            modal.form.reset();
            modal.form.hidden = true;
            showMessage("You're registered! See you at the event 🎉", false);
            updateRegisterCount();
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            button.disabled = false;
        }
    }

    // Organizer only: table of people who registered
    async function showRegistrants(event) {
        modal.registrantsTitle.textContent = "Registered participants";
        modal.registrantsBody.textContent = "";

        let list = [];
        try {
            list = await api(API + "?action=registrations&id=" + event.id);
        } catch (error) {
            modal.registrantsEmpty.textContent = error.message;
            modal.registrantsEmpty.hidden = false;
            modal.registrantsWrap.hidden = true;
            return;
        }
        if (currentEvent !== event) return; // pop-up moved on to another event

        modal.registrantsTitle.textContent = "Registered participants (" + list.length + ")";
        modal.registrantsEmpty.textContent = "No one has registered yet.";
        modal.registrantsEmpty.hidden = list.length > 0;
        modal.registrantsWrap.hidden = list.length === 0;

        list.forEach(function (p) {
            const date = new Date(p.registeredAt);
            const when = isNaN(date) ? "" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
            modal.registrantsBody.appendChild(makeRow([p.name, p.studentId || "-", p.email, when]));
        });
    }

    // Organizer only: removes the event and its registrations
    async function deleteEvent(event) {
        try {
            await api(API + "?action=delete&id=" + event.id, { method: "POST" });
            window.location.reload();
        } catch (error) {
            alert(error.message);
        }
    }

    function loadModal() {
        if (modal) return Promise.resolve(modal);

        if (!modalPromise) {
            modalPromise = fetch(MODAL_HTML_URL)
                .then(function (response) {
                    if (!response.ok) throw new Error("Could not load " + MODAL_HTML_URL);
                    return response.text();
                })
                .then(function (html) {
                    buildModal(html);
                    return modal;
                })
                .catch(function (error) {
                    modalPromise = null; // allow retry
                    throw error;
                });
        }
        return modalPromise;
    }

    function openEventDetails(event, status) {
        lastFocused = document.activeElement;

        loadModal().then(
            function () { showEventDetails(event, status); },
            function () {
                alert("Unable to load the event details. Make sure " + MODAL_HTML_URL +
                    " is in the right folder and the site is opened through Apache.");
            }
        );
    }

    function addDetail(label, value) {
        if (!value) return;
        modal.details.appendChild(el("dt", "", label));
        modal.details.appendChild(el("dd", "", value));
    }

    function showEventDetails(event, status) {
        currentEvent = event;

        modal.photo.src = event.photo;
        modal.photo.alt = event.name + " poster";
        modal.tag.textContent = getTagText(event, status);
        modal.tag.className = "qcu-modal-tag" + (status === "current" ? " live" : "");
        modal.title.textContent = event.name;
        modal.about.textContent = event.about;

        modal.details.textContent = "";
        addDetail("Date", formatDate(event));
        addDetail("Time", event.time ? formatTime(event.time) : "");
        addDetail("Venue", event.venue);
        addDetail("Organization", event.organization);
        addDetail("Category", CATEGORY_LABELS[event.category] || "");

        // Reset the registration area (participants only can register)
        modal.form.reset();
        if (me && !isOrganizer) {
            modal.form.elements.fullName.value = [me.first, me.last].filter(Boolean).join(" ");
            modal.form.elements.studentId.value = me.studentId || "";
            modal.form.elements.email.value = me.email || "";
            modal.form.elements.studentId.readOnly = true;
            modal.form.elements.email.readOnly = true;
        }
        modal.form.hidden = true;
        modal.registerBtn.hidden = isOrganizer;
        showMessage("", false);
        updateRegisterCount();

        // Edit, Delete and registrants: only for the organizer who created the event
        if (isOrganizer && event.isOwner) {
            modal.editBtn.href = POST_PAGE_URL + "?edit=" + encodeURIComponent(event.id);
            modal.ownerTools.hidden = false;
            showRegistrants(event);
        } else {
            modal.ownerTools.hidden = true;
        }

        modal.overlay.hidden = false;
        modal.scroll.scrollTop = 0;
        document.body.style.overflow = "hidden";
        modal.close.focus();
    }

    function closeEventDetails() {
        if (!modal || modal.overlay.hidden) return;
        modal.overlay.hidden = true;
        document.body.style.overflow = "";
        if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    // Post-Event page: photo preview, post and edit
    async function setupPostEventPage() {
        const eventForm = document.getElementById("eventForm");
        const eventPhoto = document.getElementById("eventPhoto");
        const preview = document.getElementById("preview");
        if (!eventForm || !eventPhoto) return;

        const field = function (id) { return document.getElementById(id); };
        const editId = new URLSearchParams(window.location.search).get("edit");
        let editingEvent = null;

        if (preview) {
            eventPhoto.addEventListener("change", function () {
                const file = this.files[0];
                if (!file) return;

                if (!file.type.startsWith("image/")) {
                    alert("Please upload an image file.");
                    this.value = "";
                    return;
                }
                preview.src = URL.createObjectURL(file);
                preview.style.display = "block";
            });
        }

        const startField = field("eventDate");
        const endField = field("eventEndDate");

        // New events can't start in the past
        if (startField && !editId) startField.min = todayText();

        // End date can't be before start date
        if (startField && endField) {
            startField.addEventListener("change", function () { endField.min = startField.value; });
        }

        if (editId) {
            try {
                editingEvent = await api(API + "?action=get&id=" + encodeURIComponent(editId));
            } catch (error) {
                editingEvent = null;
            }

            if (editingEvent && editingEvent.isOwner) {
                const e = editingEvent;
                [["eventName", e.name], ["about", e.about], ["eventDate", e.date], ["eventEndDate", e.endDate],
                 ["eventTime", e.time], ["venue", e.venue], ["organization", e.organization], ["category", e.category]]
                    .forEach(function (pair) {
                        if (field(pair[0])) field(pair[0]).value = pair[1] || "";
                    });

                eventPhoto.required = false; // old poster is kept unless a new one is chosen
                if (preview) {
                    preview.src = e.photo;
                    preview.style.display = "block";
                }

                const submit = eventForm.querySelector('[type="submit"]');
                if (submit) submit.textContent = "Save Changes";
            } else {
                alert("You can only edit events that you created.");
                window.location.href = "organizerpage.html";
                return;
            }
        }

        eventForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            const file = eventPhoto.files[0];
            const startDate = field("eventDate").value;
            const endDate = field("eventEndDate") ? field("eventEndDate").value : "";

            if (!file && !editingEvent) return alert("Please upload an event poster.");
            if (file && file.size > 2 * 1024 * 1024) return alert("Please upload an image smaller than 2 MB.");
            if (!editingEvent && startDate < todayText()) return alert("The event date can't be in the past.");
            if (endDate && endDate < startDate) return alert("The end date can't be earlier than the start date.");

            const data = new FormData();
            data.append("name", field("eventName").value.trim());
            data.append("about", field("about").value.trim());
            data.append("date", startDate);
            data.append("endDate", endDate);
            data.append("time", field("eventTime").value);
            data.append("venue", field("venue").value.trim());
            data.append("organization", field("organization").value);
            data.append("category", field("category") ? field("category").value : "");
            if (file) data.append("photo", file);

            const button = eventForm.querySelector('[type="submit"]');
            if (button) button.disabled = true;

            try {
                if (editingEvent) {
                    await api(API + "?action=update&id=" + editingEvent.id, { method: "POST", form: data });
                } else {
                    await api(API + "?action=create", { method: "POST", form: data });
                }
                alert(editingEvent ? "Event updated successfully!" : "Event posted successfully!");
                window.location.href = "organizerpage.html";
            } catch (error) {
                alert(error.message);
                if (button) button.disabled = false;
            }
        });
    }

    // Event cards (home pages and events.html)
    async function setupEventGrid() {
        const eventGrid = document.getElementById("eventGrid");
        if (!eventGrid) return;

        let events = [];
        try {
            events = await api(API + "?action=list");
        } catch (error) {
            eventGrid.appendChild(el("p", "empty-events", error.message));
            return;
        }

        const limit = parseInt(eventGrid.dataset.limit, 10) || Infinity;
        let shown = 0;

        // Newest post first; finished events only appear in History
        events.reverse().forEach(function (event) {
            const status = getStatus(event);
            if (status === "past" || shown >= limit) return;
            shown++;
            eventGrid.appendChild(createEventCard(event, status));
        });

        if (!shown && !document.getElementById("noEvents")) {
            eventGrid.appendChild(el("p", "empty-events", "No upcoming events yet. Check back soon!"));
        }

        if (document.querySelector(".status-bar")) setupFilters(eventGrid);
    }

    // events.html: status / category / search filters
    function setupFilters(eventGrid) {
        const cards = Array.from(eventGrid.querySelectorAll(".event-card"));
        const search = document.getElementById("search");
        const noEvents = document.getElementById("noEvents");
        const filters = { status: "all", category: "all" };

        function applyFilters() {
            const text = search ? search.value.trim().toLowerCase() : "";
            let visible = 0;

            cards.forEach(function (card) {
                const show =
                    (filters.status === "all" || card.dataset.status === filters.status) &&
                    (filters.category === "all" || card.dataset.category === filters.category) &&
                    card.textContent.toLowerCase().includes(text);

                card.style.display = show ? "" : "none";
                if (show) visible++;
            });

            if (noEvents) noEvents.style.display = visible ? "none" : "block";
        }

        function bindButtons(selector, name) {
            const buttons = document.querySelectorAll(selector);
            buttons.forEach(function (button) {
                button.addEventListener("click", function () {
                    buttons.forEach(function (b) { b.classList.remove("active"); });
                    button.classList.add("active");
                    filters[name] = button.dataset[name];
                    applyFilters();
                });
            });
        }

        bindButtons(".status-bar button", "status");
        bindButtons(".cat-bar button", "category");

        if (search) {
            search.addEventListener("input", applyFilters);
            if (search.form) search.form.addEventListener("submit", function (e) { e.preventDefault(); });
            search.value = new URLSearchParams(window.location.search).get("q") || ""; // events.html?q=...
        }

        applyFilters();
    }

    // Registered.html: events this participant registered for
    async function setupRegisteredPage() {
        const body = document.getElementById("registeredBody");
        if (!body) return;

        let list = [];
        try { list = await api(API + "?action=my-registrations"); } catch (error) { /* shows empty message */ }

        const rows = document.createDocumentFragment();
        list.forEach(function (entry) {
            rows.appendChild(makeRow([entry.name, formatDate(entry), formatIso(entry.registeredAt)]));
        });
        body.textContent = "";
        body.appendChild(rows);

        if (!body.children.length) {
            const table = body.closest("table");
            const row = makeRow(["You haven't registered for any events yet."]);
            row.firstChild.colSpan = (table ? table.querySelectorAll("th").length : 0) || 3;
            body.appendChild(row);
        }
    }

    // History.html: events you created or registered for
    async function setupHistoryPage() {
        const body = document.getElementById("historyBody");
        if (!body) return;

        let all = [];
        let created = [];
        let registered = [];
        try { all = await api(API + "?action=list"); } catch (error) { /* none */ }
        try { created = await api(API + "?action=my-events"); } catch (error) { /* none */ }
        try { registered = await api(API + "?action=my-registrations"); } catch (error) { /* none */ }

        const createdIds = new Set(created.map(function (e) { return String(e.id); }));
        const registeredIds = new Set(registered.map(function (e) { return String(e.id); }));

        // Show every event, plus any of the user's own that are missing from the full list
        const seen = new Set(all.map(function (e) { return String(e.id); }));
        created.concat(registered).forEach(function (e) {
            if (!seen.has(String(e.id))) { all.push(e); seen.add(String(e.id)); }
        });

        // Newest date first
        all.sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });

        const rows = document.createDocumentFragment();

        all.forEach(function (event) {
            const status = getStatus(event);
            const row = makeRow([event.name, formatDate(event)]);
            const cell = el("td");
            if (createdIds.has(String(event.id))) cell.appendChild(badge("Created", "status-created"));
            if (registeredIds.has(String(event.id))) cell.appendChild(badge("Registered", "status-created"));
            if (status === "current") cell.appendChild(badge("Happening Now", "status-live"));
            else if (status === "upcoming") cell.appendChild(badge("Upcoming", "upcoming"));
            else cell.appendChild(badge("Finished", "status-done"));
            row.appendChild(cell);
            rows.appendChild(row);
        });

        body.textContent = "";
        if (!rows.childNodes.length) {
            const row = makeRow(["No events yet."]);
            row.firstChild.colSpan = 3;
            rows.appendChild(row);
        }
        body.appendChild(rows);
    }

    function participantsLabel(event) {
        return "View participants (" + (event.registeredCount || 0) + ")";
    }

    async function toggleParticipants(event, row, button) {
        const open = row.nextElementSibling;
        if (open && open.classList.contains("participants-row")) {
            open.remove();
            button.setAttribute("aria-expanded", "false");
            button.textContent = participantsLabel(event);
            return;
        }

        const detail = el("tr", "participants-row");
        const cell = el("td", "participants-cell", "Loading participants...");
        cell.colSpan = row.children.length;
        detail.appendChild(cell);
        row.after(detail);
        button.setAttribute("aria-expanded", "true");
        button.textContent = "Hide participants";

        let list = [];
        try {
            list = await api(API + "?action=registrations&id=" + event.id);
        } catch (error) {
            cell.textContent = error.message;
            return;
        }
        if (!detail.isConnected) return;

        event.registeredCount = list.length;
        cell.textContent = "";
        cell.appendChild(el("h3", "participants-title", "Registered participants (" + list.length + ")"));

        if (!list.length) {
            cell.appendChild(el("p", "participants-empty", "No one has registered yet."));
            return;
        }

        const table = el("table", "participants-table");
        const headRow = el("tr");
        ["Name", "Student ID", "Email", "Registered"].forEach(function (title) {
            headRow.appendChild(el("th", "", title));
        });
        table.appendChild(el("thead")).appendChild(headRow);

        const tbody = el("tbody");
        list.forEach(function (p) {
            const date = new Date(p.registeredAt);
            const when = isNaN(date) ? "-" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
            tbody.appendChild(makeRow([p.name, p.studentId || "-", p.email, when]));
        });
        table.appendChild(tbody);

        const wrap = el("div", "participants-wrap");
        wrap.appendChild(table);
        cell.appendChild(wrap);
    }

    // CreatedEvents.html: events created by the logged-in organizer
    async function setupCreatedPage() {
        const body = document.getElementById("createdBody");
        if (!body) return;

        let created = [];
        try { created = await api(API + "?action=my-events"); } catch (error) { /* shows empty message */ }
        if (!created.length) return; // keeps the "No events created yet." row

        const rows = document.createDocumentFragment();
        created.forEach(function (event) {
            const status = getStatus(event);
            const row = makeRow([event.name, formatDate(event)]);
            const cell = el("td");
            if (status === "current") cell.appendChild(badge("Happening Now", "status-live"));
            else if (status === "upcoming") cell.appendChild(badge("Upcoming", "upcoming"));
            else cell.appendChild(badge("Finished", "status-done"));
            row.appendChild(cell);

            const toggle = el("button", "participants-toggle", participantsLabel(event));
            toggle.type = "button";
            toggle.setAttribute("aria-expanded", "false");
            toggle.addEventListener("click", function () { toggleParticipants(event, row, toggle); });
            const actionCell = el("td");
            actionCell.appendChild(toggle);
            row.appendChild(actionCell);

            rows.appendChild(row);
        });
        body.textContent = "";
        body.appendChild(rows);
    }

    // orgs.html: search box and category filter for the organization cards
    function setupOrgsPage() {
        const input = document.getElementById("orgSearchInput");
        if (!input) return;

        const cards = Array.from(document.querySelectorAll(".event-grid .event-card"));
        const noOrgs = document.getElementById("noEvents");
        const count = document.getElementById("orgCount");
        const buttons = document.querySelectorAll(".cat-bar button");
        let category = "all";

        function apply() {
            const text = input.value.trim().toLowerCase();
            let visible = 0;

            cards.forEach(function (card) {
                const show = (category === "all" || card.dataset.category === category) &&
                    card.textContent.toLowerCase().includes(text);
                card.style.display = show ? "" : "none";
                if (show) visible++;
            });

            if (noOrgs) noOrgs.style.display = visible ? "none" : "block";
            if (count) count.textContent = visible + (visible === 1 ? " Organization" : " Organizations");
        }

        buttons.forEach(function (button) {
            button.addEventListener("click", function () {
                buttons.forEach(function (b) { b.classList.remove("active"); });
                button.classList.add("active");
                category = button.dataset.category;
                apply();
            });
        });

        input.addEventListener("input", apply);
        apply();
    }

    // login.html: shows the right login screen and signs the user in through login2.php
    function setupLoginPage() {
        const views = {
            choice:      { bodyClass: "login-choice-page",      title: "Log In | QCU EVENTS" },
            organizer:   { bodyClass: "organizer-login-page",   title: "Organizer Login | QCU EVENTS" },
            participant: { bodyClass: "participant-login-page", title: "Participant Login | QCU EVENTS" }
        };
        if (!document.getElementById("view-choice")) return;

        const params = new URLSearchParams(window.location.search);
        let view = params.get("role");
        if (!views[view]) view = "choice";

        Object.keys(views).forEach(function (name) {
            document.getElementById("view-" + name).hidden = name !== view;
        });
        document.body.className = views[view].bodyClass;
        document.title = views[view].title;

        function loginMessage(form, text, isError) {
            const note = form.querySelector(".login-message");
            note.textContent = text;
            note.style.color = isError ? "red" : "green";
        }

        document.querySelectorAll("form.login-form").forEach(function (form) {
            // signup.php sends ?registered=1 after a new account is created
            if (params.has("registered") && form.dataset.role === view) {
                loginMessage(form, "Account created! Please log in.", false);
            }

            form.addEventListener("submit", async function (e) {
                e.preventDefault();

                const button = form.querySelector('[type="submit"]');
                const data = new FormData(form);
                data.append("role", form.dataset.role);

                button.disabled = true;
                loginMessage(form, "", false);

                try {
                    const result = await api("login.php", { method: "POST", form: data });
                    window.location.href = result.redirect;
                    return;
                } catch (error) {
                    loginMessage(form, error.message, true);
                }
                button.disabled = false;
            });
        });
    }

    // account.html: shows save messages and fills in the logged-in user's details
    async function setupAccountPage() {
        const errorBox = document.getElementById("error");
        if (!errorBox || !document.getElementById("id-label")) return;

        const params = new URLSearchParams(window.location.search);

        function showError(message) {
            errorBox.textContent = message;
            errorBox.hidden = false;
        }

        if (params.has("success")) {
            document.getElementById("success").hidden = false;
        }
        if (params.get("error")) {
            showError(params.get("error"));
        }

        try {
            const user = await api("Account.php?data=1");

            document.title = user.title + " | QCU EVENTS";
            document.getElementById("first").value = user.first;
            document.getElementById("last").value = user.last;
            document.getElementById("email").value = user.email;

            const idInput = document.getElementById("studentId");
            idInput.value = user.studentId;
            idInput.id = user.idField;

            const idLabel = document.getElementById("id-label");
            idLabel.textContent = user.idLabel;
            idLabel.htmlFor = user.idField;

            document.getElementById("back-link").href = user.home;
            document.getElementById("cancel-link").href = user.home;
        } catch (error) {
            if (error.status === 401) {
                window.location.href = "login.php";
                return;
            }
            showError(error.message);
        }
    }

    // signup.html: shows the error and refills the fields sent back by signup.php
    function setupSignupPage() {
        const box = document.getElementById("error");
        if (!box || !document.querySelector('form[action="signup.php"]')) return;

        const params = new URLSearchParams(window.location.search);

        const error = params.get("error");
        if (error) {
            box.textContent = error;
            box.hidden = false;
        }

        ["role", "studentID", "email"].forEach(function (id) {
            const value = params.get(id);
            const field = document.getElementById(id);
            if (value && field) field.value = value;
        });
    }

    // Start
    async function init() {
        try {
            me = (await api(API + "?action=me")).user;
        } catch (error) {
            me = null;
        }
        isOrganizer = !!me && me.role === "organizer";

        // Page access rules
        if (!me && !isPublicPage) { window.location.replace("login.html"); return; }
        if (me && !isOrganizer && ORGANIZER_ONLY.indexOf(pageName) !== -1) {
            window.location.replace("participantpage.html");
            return;
        }
        if (isOrganizer && pageName === "registered.html") {
            window.location.replace("CreatedEvents.html");
            return;
        }
        if (isOrganizer && pageName === "participantpage.html") {
            window.location.replace("organizerpage.html");
            return;
        }
        root.style.visibility = "";

        setupPageBasics();
        setupSidebarForRole();
        setupLoginPage();
        await setupPostEventPage();
        await setupEventGrid();
        await setupRegisteredPage();
        await setupHistoryPage();
        await setupCreatedPage();
        setupOrgsPage();
        setupSignupPage();
        await setupAccountPage();
    }

    init().catch(function (error) {
        root.style.visibility = "";
        console.error(error);
    });
})();