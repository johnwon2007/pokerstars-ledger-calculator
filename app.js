const fileInput = document.getElementById("csvFile");
const resultsPanel = document.getElementById("resultsPanel");
const totalsTableBody = document.querySelector("#totalsTable tbody");
const transfersTableBody = document.querySelector("#transfersTable tbody");
const transferHint = document.getElementById("transferHint");
const rowCount = document.getElementById("rowCount");
const netTotal = document.getElementById("netTotal");
const transfersCard = document.getElementById("transfersCard");
const downloadTransfersBtn = document.getElementById("downloadTransfersBtn");
const totalsCard = document.getElementById("totalsCard");
const downloadTotalsBtn = document.getElementById("downloadTotalsBtn");
const resultsGrid = document.getElementById("resultsGrid");
const downloadAllBtn = document.getElementById("downloadAllBtn");

downloadTransfersBtn.addEventListener("click", async () => {
  if (!transfersCard) {
    return;
  }
  if (typeof html2canvas !== "function") {
    alert("Image export is unavailable. Please refresh and try again.");
    return;
  }

  await downloadCardImage({
    target: transfersCard,
    filename: "poker-transfers.png",
    button: downloadTransfersBtn,
  });
});

downloadTotalsBtn.addEventListener("click", async () => {
  if (!totalsCard) {
    return;
  }
  if (typeof html2canvas !== "function") {
    alert("Image export is unavailable. Please refresh and try again.");
    return;
  }

  await downloadCardImage({
    target: totalsCard,
    filename: "poker-totals.png",
    button: downloadTotalsBtn,
  });
});

downloadAllBtn.addEventListener("click", async () => {
  if (!resultsGrid) {
    return;
  }
  if (typeof html2canvas !== "function") {
    alert("Image export is unavailable. Please refresh and try again.");
    return;
  }

  await downloadCardImage({
    target: resultsGrid,
    filename: "poker-results.png",
    button: downloadAllBtn,
  });
});

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const text = await file.text();
  const rows = parseCSV(text);

  if (rows.length <= 1) {
    renderEmpty("No data rows found in the CSV.");
    return;
  }

  const header = rows[0].map((value) => value.trim());
  const dataRows = rows.slice(1);

  const colIndex = {
    nickname: header.indexOf("player_nickname"),
    playerId: header.indexOf("player_id"),
    net: header.indexOf("net"),
  };

  if (colIndex.nickname === -1 || colIndex.playerId === -1 || colIndex.net === -1) {
    renderEmpty("Missing required columns: player_nickname, player_id, net.");
    return;
  }

  const players = new Map();

  dataRows.forEach((row) => {
    if (row.length === 0 || row.every((cell) => cell.trim() === "")) {
      return;
    }

    const playerId = row[colIndex.playerId]?.trim();
    if (!playerId) {
      return;
    }

    const nickname = row[colIndex.nickname]?.trim() || "Unknown";
    const netValue = parseNumber(row[colIndex.net]);

    const current = players.get(playerId) || {
      playerId,
      nicknames: new Set(),
      net: 0,
    };

    current.net += netValue;
    if (nickname) {
      current.nicknames.add(nickname);
    }
    players.set(playerId, current);
  });

  const playerList = Array.from(players.values())
    .map((player) => ({
      ...player,
      nickname: formatNicknames(player.nicknames),
    }))
    .sort((a, b) => b.net - a.net);
  const totalNetValue = playerList.reduce((sum, player) => sum + player.net, 0);
  const totalNetRounded = Math.round(totalNetValue);
  const transfers = totalNetRounded === 0 ? computeTransfers(playerList) : [];

  renderTotals(playerList);
  renderTransfers(transfers);
  resultsPanel.hidden = false;
  rowCount.textContent = `${playerList.length} players, ${dataRows.length} rows`;
  renderTotalNet(totalNetValue);
});

function renderTotals(players) {
  totalsTableBody.innerHTML = "";

  if (players.length === 0) {
    totalsTableBody.innerHTML = `<tr><td colspan="3">No players found.</td></tr>`;
    setDownloadState(downloadTotalsBtn, false);
    setDownloadState(downloadAllBtn, false);
    return;
  }

  players.forEach((player) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHTML(player.nickname)}</td>
      <td>${escapeHTML(player.playerId)}</td>
      <td class="num">${formatMoney(player.net)}</td>
    `;
    totalsTableBody.appendChild(row);
  });

  setDownloadState(downloadTotalsBtn, true);
  setDownloadState(downloadAllBtn, true);
}

function renderTransfers(transfers) {
  transfersTableBody.innerHTML = "";

  if (transfers.length === 0) {
    transfersTableBody.innerHTML = `<tr><td colspan="3">No transfers needed.</td></tr>`;
    transferHint.textContent = "Everyone is settled already.";
    setDownloadState(downloadTransfersBtn, true);
    return;
  }

  transfers.forEach((transfer) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHTML(transfer.from.nickname)}</td>
      <td>${escapeHTML(transfer.to.nickname)}</td>
      <td class="num">${formatMoney(transfer.amount)}</td>
    `;
    transfersTableBody.appendChild(row);
  });

  transferHint.textContent = `${transfers.length} transfers required.`;
  setDownloadState(downloadTransfersBtn, true);
}

function renderEmpty(message) {
  resultsPanel.hidden = false;
  totalsTableBody.innerHTML = `<tr><td colspan="3">${escapeHTML(message)}</td></tr>`;
  transfersTableBody.innerHTML = `<tr><td colspan="3">No transfers computed.</td></tr>`;
  transferHint.textContent = "";
  rowCount.textContent = "";
  netTotal.textContent = "";
  setDownloadState(downloadTransfersBtn, false);
  setDownloadState(downloadTotalsBtn, false);
  setDownloadState(downloadAllBtn, false);
}

function computeTransfers(players) {
  const creditors = players
    .filter((player) => player.net > 0)
    .map((player) => ({ ...player }));
  const debtors = players
    .filter((player) => player.net < 0)
    .map((player) => ({ ...player }));

  creditors.sort((a, b) => b.net - a.net);
  debtors.sort((a, b) => a.net - b.net);

  const transfers = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const amount = Math.min(creditor.net, -debtor.net);
    if (amount > 0) {
      transfers.push({ from: debtor, to: creditor, amount });
      debtor.net += amount;
      creditor.net -= amount;
    }

    if (Math.abs(debtor.net) < 0.0001) {
      i += 1;
    }
    if (Math.abs(creditor.net) < 0.0001) {
      j += 1;
    }
  }

  return transfers;
}

function parseNumber(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  const cleaned = String(value).replace(/,/g, "").trim();
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  const rounded = Math.round(value);
  return rounded.toLocaleString("en-US");
}

function renderTotalNet(total) {
  const rounded = Math.round(total);
  if (rounded === 0) {
    netTotal.classList.remove("warn");
    netTotal.textContent = "Total net: 0 (balanced)";
    return;
  }
  netTotal.classList.add("warn");
  netTotal.textContent = `Total net: ${formatMoney(rounded)} (unbalanced, transfers disabled)`;
  transfersTableBody.innerHTML = `<tr><td colspan="3">Transfers disabled. Fix the CSV total net first.</td></tr>`;
  transferHint.textContent = "";
  setDownloadState(downloadTransfersBtn, false);
}

function formatNicknames(nicknameSet) {
  const names = Array.from(nicknameSet).filter((name) => name);
  if (names.length === 0) {
    return "Unknown";
  }
  return names.join(", ");
}

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function downloadCardImage({ target, filename, button }) {
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = "Preparing...";

  try {
    const canvas = await html2canvas(target, {
      backgroundColor: "#0a0a0c",
      scale: 2,
    });
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.click();
  } catch (error) {
    alert("Unable to capture the image. Please try again.");
    console.error(error);
  } finally {
    button.textContent = originalLabel;
    button.disabled = false;
  }
}

function setDownloadState(button, enabled) {
  if (!button) {
    return;
  }
  button.hidden = !enabled;
  button.disabled = !enabled;
}
