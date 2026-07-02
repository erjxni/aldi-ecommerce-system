const financeDateRange = document.getElementById("finance-date-range");
const financeStartDate = document.getElementById("finance-start-date");
const financeEndDate = document.getElementById("finance-end-date");
const loadFinanceReportButton = document.getElementById("load-finance-report");
const downloadFinanceCsvButton = document.getElementById("download-finance-csv");
const financeMessage = document.getElementById("finance-message");

const financeTotalRevenue = document.getElementById("finance-total-revenue");
const financeTotalExpenses = document.getElementById("finance-total-expenses");
const financeTotalProfit = document.getElementById("finance-total-profit");
const financeLedgerBody = document.getElementById("finance-ledger-body");

let currentFinanceRecords = [];

function formatCurrency(amount) {
    return `€${Number(amount || 0).toFixed(2)}`;
}

function formatDateForInput(date) {
    return date.toISOString().split("T")[0];
}

function getAuthToken() {
    return (
        localStorage.getItem("userToken") ||
        localStorage.getItem("token") ||
        localStorage.getItem("authToken")
    );
}

function setFinanceMessage(message, type = "") {
    financeMessage.textContent = message;
    financeMessage.className = `finance-message ${type}`;
}

function applyPresetDateRange() {
    const selectedRange = financeDateRange.value;

    if (selectedRange === "custom") {
        return;
    }

    const endDate = new Date();
    const startDate = new Date();

    startDate.setDate(endDate.getDate() - Number(selectedRange));

    financeStartDate.value = formatDateForInput(startDate);
    financeEndDate.value = formatDateForInput(endDate);
}

function buildFinanceSummaryUrl() {
    const params = new URLSearchParams();

    if (financeStartDate.value) {
        params.append("startDate", financeStartDate.value);
    }

    if (financeEndDate.value) {
        params.append("endDate", financeEndDate.value);
    }

    return `/api/finance/summary?${params.toString()}`;
}

async function loadFinanceReport() {
    const token = getAuthToken();

    if (!token) {
        setFinanceMessage("Please log in as an admin or financial officer to view this report.", "error");
        return;
    }

    setFinanceMessage("Loading financial report...");

    try {
        const response = await fetch(buildFinanceSummaryUrl(), {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (response.status === 403) {
            setFinanceMessage("Access denied. Only admin or financial officer roles can view this report.", "error");
            return;
        }

        if (!response.ok) {
            setFinanceMessage(result.error || "Failed to load financial report.", "error");
            return;
        }

        currentFinanceRecords = result.records || [];

        renderFinanceSummary(result.summary);
        renderFinanceLedger(currentFinanceRecords);

        setFinanceMessage("Financial report loaded successfully.", "success");
    } catch (error) {
        console.error("Failed to fetch finance summary:", error);
        setFinanceMessage("Network error while loading financial report.", "error");
    }
}

function renderFinanceSummary(summary) {
    financeTotalRevenue.textContent = formatCurrency(summary?.totalRevenue || 0);
    financeTotalExpenses.textContent = formatCurrency(summary?.totalExpenses || 0);
    financeTotalProfit.textContent = formatCurrency(summary?.totalProfit || 0);
}

function renderFinanceLedger(records) {
    if (!records.length) {
        financeLedgerBody.innerHTML = `
            <tr>
                <td colspan="5">No records found for the selected date range.</td>
            </tr>
        `;
        return;
    }

    financeLedgerBody.innerHTML = records.map((record) => {
        return `
            <tr>
                <td>${record.createdAt || ""}</td>
                <td>${record.transactionType || ""}</td>
                <td>${record.description || ""}</td>
                <td>${formatCurrency(record.amount)}</td>
                <td>${record.relatedOrderId || "N/A"}</td>
            </tr>
        `;
    }).join("");
}

function escapeCsvValue(value) {
    const stringValue = String(value ?? "");

    if (
        stringValue.includes(",") ||
        stringValue.includes('"') ||
        stringValue.includes("\n")
    ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
}

function convertRecordsToCsv(records) {
    const headers = [
        "Date",
        "Transaction Type",
        "Description",
        "Amount",
        "Related Order"
    ];

    const rows = records.map((record) => [
        record.createdAt || "",
        record.transactionType || "",
        record.description || "",
        Number(record.amount || 0).toFixed(2),
        record.relatedOrderId || "N/A"
    ]);

    return [
        headers.map(escapeCsvValue).join(","),
        ...rows.map((row) => row.map(escapeCsvValue).join(","))
    ].join("\n");
}

function downloadCsvReport() {
    if (!currentFinanceRecords.length) {
        setFinanceMessage("Please load a report before downloading CSV.", "error");
        return;
    }

    const csvContent = convertRecordsToCsv(currentFinanceRecords);
    const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;"
    });

    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = `financial-report-${financeStartDate.value || "start"}-to-${financeEndDate.value || "end"}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(downloadUrl);

    setFinanceMessage("CSV report downloaded successfully.", "success");
}

financeDateRange.addEventListener("change", () => {
    applyPresetDateRange();
});

loadFinanceReportButton.addEventListener("click", () => {
    loadFinanceReport();
});

downloadFinanceCsvButton.addEventListener("click", () => {
    downloadCsvReport();
});

applyPresetDateRange();