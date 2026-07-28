/* ============================================================
   CONFIG — set this to your deployed Cloudflare Worker URL.
   Do NOT put the raw pumpdev.io key here; the worker hides it.
   ============================================================ */
const FEED_WS_URL = "wss://crypto.detlaffcameron.workers.dev";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUP_QUOTE_API = "https://quote-api.jup.ag/v6/quote";
const JUP_SWAP_API = "https://quote-api.jup.ag/v6/swap";
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

/* ---------------- state ---------------- */
let ws = null;
let tokens = new Map();      // mint -> {symbol, name, price, change24h, mcap}
let selectedMint = null;
let side = "buy";
let slippageBps = 100;       // 1%
let wallet = null;           // Phantom provider
let publicKey = null;

const $ = (id) => document.getElementById(id);
const feedBody = $("feedBody");
const ticker = $("ticker");
const wsDot = $("wsDot");
const connLabel = $("connLabel");
const walletBtn = $("walletBtn");
const executeBtn = $("executeBtn");
const statusLog = $("statusLog");
const selectedTokenBox = $("selectedTokenBox");

function log(msg, cls) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  statusLog.prepend(d);
}

/* ---------------- WebSocket feed ---------------- */
function connectFeed() {
  ws = new WebSocket(FEED_WS_URL);

  ws.onopen = () => {
    wsDot.className = "dot live";
    connLabel.textContent = "live";
    log("Connected to feed.", "ok");
  };
  ws.onclose = () => {
    wsDot.className = "dot down";
    connLabel.textContent = "disconnected — retrying…";
    log("Feed disconnected, retrying in 3s.", "err");
    setTimeout(connectFeed, 3000);
  };
  ws.onerror = () => { wsDot.className = "dot down"; };
  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      handleFeedMessage(msg);
    } catch (e) { /* ignore non-JSON pings etc */ }
  };
}

// NOTE: adjust this parser to match pumpdev.io's actual message schema —
// this assumes a shape like { mint, symbol, name, price, change24h, mcap }.
// Check pumpdev.io's docs and tweak the field names below if they differ.
function handleFeedMessage(msg) {
  const mint = msg.mint || msg.address || msg.id;
  if (!mint) return;
  tokens.set(mint, {
    mint,
    symbol: msg.symbol || "???",
    name: msg.name || "",
    price: Number(msg.price ?? msg.priceUsd ?? 0),
    change24h: Number(msg.change24h ?? msg.priceChange24h ?? 0),
    mcap: Number(msg.mcap ?? msg.marketCap ?? 0),
  });
  renderFeed();
  renderTicker();
  if (mint === selectedMint) renderSelectedToken();
}

function fmtPrice(p) {
  if (!p) return "—";
  if (p < 0.01) return "$" + p.toFixed(6);
  return "$" + p.toFixed(4);
}
function fmtMcap(m) {
  if (!m) return "—";
  if (m > 1e6) return "$" + (m / 1e6).toFixed(2) + "M";
  if (m > 1e3) return "$" + (m / 1e3).toFixed(1) + "K";
  return "$" + m.toFixed(0);
}

function renderFeed() {
  if (tokens.size === 0) return;
  const rows = [...tokens.values()].slice(0, 60).map(t => {
    const dir = t.change24h >= 0 ? "up" : "down";
    return `<tr data-mint="${t.mint}" class="${t.mint === selectedMint ? 'selected' : ''}">
      <td class="sym">${t.symbol}<small>${t.name}</small></td>
      <td class="num">${fmtPrice(t.price)}</td>
      <td class="num ${dir}">${t.change24h >= 0 ? '+' : ''}${t.change24h.toFixed(2)}%</td>
      <td class="num">${fmtMcap(t.mcap)}</td>
    </tr>`;
  }).join("");
  feedBody.innerHTML = rows;
  feedBody.querySelectorAll("tr[data-mint]").forEach(row => {
    row.addEventListener("click", () => selectToken(row.dataset.mint));
  });
}

function renderTicker() {
  const items = [...tokens.values()].slice(0, 30);
  if (items.length === 0) return;
  const html = items.map(t => {
    const dir = t.change24h >= 0 ? "tick-up" : "tick-down";
    return `<span class="tick-item"><b>${t.symbol}</b>${fmtPrice(t.price)} <span class="${dir}">${t.change24h >= 0 ? '+' : ''}${t.change24h.toFixed(1)}%</span></span>`;
  }).join("");
  ticker.innerHTML = html + html; // duplicate for seamless loop
}

function selectToken(mint) {
  selectedMint = mint;
  renderFeed();
  renderSelectedToken();
  updateExecuteState();
}

function renderSelectedToken() {
  const t = tokens.get(selectedMint);
  if (!t) return;
  selectedTokenBox.innerHTML = `
    <div class="sym">${t.symbol} <span class="placeholder">${t.name}</span></div>
    <div class="price">${fmtPrice(t.price)}</div>
  `;
}

/* ---------------- wallet ---------------- */
async function connectWallet() {
  const provider = window?.phantom?.solana || window.solana;
  if (!provider || !provider.isPhantom) {
    log("Phantom wallet not found. Install it from phantom.app.", "err");
    window.open("https://phantom.app/", "_blank");
    return;
  }
  try {
    const resp = await provider.connect();
    wallet = provider;
    publicKey = resp.publicKey.toString();
    walletBtn.textContent = publicKey.slice(0, 4) + "…" + publicKey.slice(-4);
    walletBtn.classList.add("connected");
    log(`Wallet connected: ${publicKey}`, "ok");
    updateExecuteState();
  } catch (e) {
    log("Wallet connection rejected.", "err");
  }
}

function updateExecuteState() {
  if (!publicKey) {
    executeBtn.disabled = true;
    executeBtn.textContent = "Connect wallet to trade";
    return;
  }
  if (!selectedMint) {
    executeBtn.disabled = true;
    executeBtn.textContent = "Select a token";
    return;
  }
  executeBtn.disabled = false;
  executeBtn.textContent = side === "buy" ? "Buy" : "Sell";
}

/* ---------------- side / slippage toggles ---------------- */
$("buySideBtn").addEventListener("click", () => {
  side = "buy";
  $("buySideBtn").classList.add("active");
  $("sellSideBtn").classList.remove("active");
  executeBtn.className = "buy";
  updateExecuteState();
});
$("sellSideBtn").addEventListener("click", () => {
  side = "sell";
  $("sellSideBtn").classList.add("active");
  $("buySideBtn").classList.remove("active");
  executeBtn.className = "sell";
  updateExecuteState();
});
document.querySelectorAll(".slip-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".slip-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    slippageBps = Math.round(parseFloat(chip.dataset.v) * 100);
  });
});

/* ---------------- trade execution via Jupiter ---------------- */
async function executeTrade() {
  const amount = parseFloat($("amountInput").value);
  if (!amount || amount <= 0) { log("Enter an amount first.", "err"); return; }
  if (!selectedMint || !publicKey) return;

  const inputMint = side === "buy" ? SOL_MINT : selectedMint;
  const outputMint = side === "buy" ? selectedMint : SOL_MINT;
  const lamports = side === "buy"
    ? Math.round(amount * 1e9)          // amount is in SOL
    : Math.round(amount);                // for sells you'd pass token base units instead

  executeBtn.disabled = true;
  executeBtn.textContent = "Fetching quote…";

  try {
    const quoteUrl = `${JUP_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${lamports}&slippageBps=${slippageBps}`;
    const quoteRes = await fetch(quoteUrl);
    if (!quoteRes.ok) throw new Error("Quote request failed");
    const quote = await quoteRes.json();
    log(`Quote received: ${JSON.stringify(quote.outAmount || {})}`);

    executeBtn.textContent = "Building transaction…";
    const swapRes = await fetch(JUP_SWAP_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: publicKey,
        wrapAndUnwrapSol: true,
      }),
    });
    if (!swapRes.ok) throw new Error("Swap build failed");
    const { swapTransaction } = await swapRes.json();

    executeBtn.textContent = "Confirm in wallet…";
    const txBuf = Uint8Array.from(atob(swapTransaction), c => c.charCodeAt(0));
    const tx = solanaWeb3.VersionedTransaction.deserialize(txBuf);

    const { signature } = await wallet.signAndSendTransaction(tx);
    log(`Transaction sent: ${signature}`, "ok");
    executeBtn.textContent = "Confirming…";

    const connection = new solanaWeb3.Connection(SOLANA_RPC, "confirmed");
    await connection.confirmTransaction(signature, "confirmed");
    log(`Confirmed: ${signature}`, "ok");
  } catch (e) {
    log(`Trade failed: ${e.message}`, "err");
  } finally {
    updateExecuteState();
  }
}

walletBtn.addEventListener("click", connectWallet);
executeBtn.addEventListener("click", executeTrade);

connectFeed();
